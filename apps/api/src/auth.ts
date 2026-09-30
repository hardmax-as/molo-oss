import { expo } from "@better-auth/expo";
import { normaliseAccountName } from "@molo/core";
import { schema, type Db } from "@molo/db";
import { isUiLanguage, type UiLanguage } from "@molo/i18n";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import type { Context } from "hono";

import { emailChangeFromToken, emailChangeMails, landOnSettings } from "./account-email.ts";
import { createAgeGate } from "./age-gate.ts";
import { logSocialFailures } from "./auth-log.ts";
import { sendEmail } from "./email.ts";
import type { AppEnv, Bindings } from "./env.ts";
import { announceCompletedMember } from "./slack-events.ts";

/**
 * Better Auth over our Drizzle tables (packages/db/src/schema/auth.ts).
 * Email + password and magic links at launch (STACK.md). Every new user
 * gets the `learner` role; editor and admin are granted by an admin.
 *
 * Built per request because the database client is per request; the
 * construction is cheap relative to the query it fronts.
 */
export function createAuth(env: Bindings, db: Db, onCompletedMember?: (userId: string) => void) {
  const ageGate = createAgeGate();
  return betterAuth({
    appName: "Molo",
    // The age gate may refuse a request; the logger reports social failures by code only.
    hooks: { before: ageGate.before, after: logSocialFailures },
    user: {
      // Settings → Account. A verified address changes only when the link
      // mailed to the new one is opened (Better Auth's change-email-verification
      // flow); the current address gets a notice at the same time
      // (account-email.ts). `updateEmailWithoutVerification` stays off.
      changeEmail: { enabled: true },
      additionalFields: {
        ageOk: { type: "boolean", required: false, defaultValue: false, input: false },
        country: { type: "string", required: false, input: false },
        // Server-only: set by the age gate on a one-tap social sign-up, cleared by POST /me/age.
        agePending: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    // The Expo app signs in from its own scheme; Expo Go (dev only) uses exp://.
    trustedOrigins: [env.WEB_ORIGIN, "molo://", ...(env.ENVIRONMENT === "local" ? ["exp://"] : [])],
    database: drizzleAdapter(db, {
      provider: "pg",
      // Our exports are plural (users, sessions, ...); the SQL names stay singular.
      usePlural: true,
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
    }),
    account: {
      accountLinking: {
        enabled: true,
        // No provider is trusted by name, so implicit linking on sign-in needs a
        // verified e-mail on both the provider and the local account (Better
        // Auth's requireLocalEmailVerified default), and explicit linking needs
        // a provider-verified e-mail.
        trustedProviders: [],
        // Explicit linking only (Settings, signed in, POST /link-social behind a
        // session): Apple's private relay address never matches the account's.
        // Implicit linking on sign-in still matches by e-mail alone.
        allowDifferentEmails: true,
        // The last way to sign in can never be removed.
        allowUnlinkingAll: false,
      },
    },
    // Offered only when both values exist; /auth/providers tells clients which buttons to show.
    // `disableImplicitSignUp` stays: current clients send `requestSignUp: true`
    // on every Apple/Google tap, so one tap creates the account (behind the age
    // step, see age-gate.ts), while an app build from before the age step, which
    // cannot show it, keeps getting "no account" instead of a stuck account.
    socialProviders: {
      ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
        ? {
            apple: {
              disableImplicitSignUp: true,
              clientId: env.APPLE_CLIENT_ID,
              clientSecret: env.APPLE_CLIENT_SECRET,
              ...(env.APPLE_APP_BUNDLE_IDENTIFIER
                ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER }
                : {}),
            },
          }
        : {}),
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              disableImplicitSignUp: true,
            },
          }
        : {}),
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      requireEmailVerification: env.ENVIRONMENT === "prod",
    },
    // Production requires a verified address before the first sign-in, so the
    // verification mail has to exist: sent on sign-up, re-sent on every sign-in
    // attempt while unverified, and the link signs the browser in on success.
    emailVerification: {
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        // Settings → Change email comes through here too, told apart by its token.
        const change = emailChangeFromToken(token);
        if (change) {
          const lang = await sourceLangOf(db, user.id);
          const mails = emailChangeMails(change, landOnSettings(url, env.WEB_ORIGIN), lang);
          await Promise.all(mails.map((mail) => sendEmail(env, mail)));
          return;
        }
        await sendEmail(env, {
          to: user.email,
          subject: "Verify your email for Molo",
          text: `Confirm your email address to start using Molo: ${url}\n\nThe link expires in an hour. If you did not create a Molo account, ignore this email.`,
        });
      },
    },
    plugins: [
      accountNameGuard,
      // Rewrites the expo-origin header into origin so the mobile client passes the CSRF check,
      // and proxies OAuth authorisation URLs for the app.
      expo(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendEmail(env, {
            to: email,
            subject: "Your Molo sign-in link",
            text: `Sign in to Molo: ${url}\n\nThis link expires shortly. If you did not ask for it, ignore this email.`,
          });
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          before: ageGate.beforeCreate,
          after: async (user) => {
            await db
              .insert(schema.userRoles)
              .values({ userId: user.id, role: "learner" })
              .onConflictDoNothing();
            // Email (and older social clients with upfront proof) passed the age gate.
            // One-tap inserts are deliberately excluded: POST /me/age announces those.
            if (user["ageOk"] === true && user["agePending"] === false)
              onCompletedMember?.(user.id);
          },
        },
      },
    },
  });
}

/** Collect completions during auth, then schedule only after the auth response is decided.
 * Provider accounts are now committed, so the notifier can identify apple/google/email. */
export async function handleAuthRequest(c: Context<AppEnv>): Promise<Response> {
  const completed = new Set<string>();
  const response = await createAuth(c.env, c.get("db"), (id) => {
    completed.add(id);
  }).handler(c.req.raw);
  c.res = response;
  if (response.status < 400) {
    for (const id of completed) announceCompletedMember(c, id);
  }
  return response;
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Settings → Account → Name goes through Better Auth's `/update-user`, which
 * takes any string. This holds it to the account-name shape (1–80 characters
 * after trimming, nothing invisible) and stores it trimmed. The league name
 * derived from it is filtered where leagues read it.
 */
const accountNameGuard = {
  id: "molo-account-name",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/update-user",
        handler: createAuthMiddleware(async (ctx) => {
          const body: unknown = ctx.body;
          if (typeof body !== "object" || body === null || !("name" in body)) return;
          const name = normaliseAccountName((body as { name: unknown }).name);
          if (name === null)
            throw new APIError("BAD_REQUEST", { code: "INVALID_NAME", message: "invalid name" });
          (body as { name: string }).name = name;
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;

/** The learner's language for a mail; English when there is no preference row. */
async function sourceLangOf(db: Db, userId: string): Promise<UiLanguage> {
  const [row] = await db
    .select({ sourceLang: schema.userPrefs.sourceLang })
    .from(schema.userPrefs)
    .where(eq(schema.userPrefs.userId, userId))
    .limit(1);
  return isUiLanguage(row?.sourceLang) ? row.sourceLang : "en";
}
