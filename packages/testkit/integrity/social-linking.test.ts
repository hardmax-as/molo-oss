import { schema, type Db } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { harness, type Harness } from "./helpers.ts";

/**
 * Social sign-in and account linking through the real Better Auth
 * configuration (apps/api/src/auth.ts) against Postgres. Google's id tokens
 * are signed here with a throwaway key whose public half is served in place
 * of Google's certificate endpoint, so the server's own verification runs.
 *
 * The contract: a social sign-in that does not ask to sign up (an app build
 * from before the age step) never creates an account; one that asks
 * (`requestSignUp`, every current client) creates it in one tap, behind the
 * age step unless it carries the age declaration; while the age step is owed
 * the API refuses everything but the step, export and deletion, and below
 * the minimum age the step deletes the account; linking needs a session and
 * may cross e-mail addresses (Apple's relay) only when it is explicit;
 * implicit linking on sign-in needs a verified e-mail on both sides; the last
 * way to sign in cannot be removed.
 */

// Keep the Worker's globals in the API typecheck; only the HTTP boundary crosses.
const apiHarnessModule = "../../../apps/api/src/test/auth-harness.ts";
const {
  authTestApp,
  AUTH_TEST_GOOGLE_CLIENT_ID,
}: {
  authTestApp: (db: Db) => {
    request: (
      path: string,
      init?: { body?: unknown; cookie?: string; method?: string },
    ) => Promise<Response>;
    api: (
      path: string,
      init?: { body?: unknown; cookie?: string; method?: string },
    ) => Promise<Response>;
    routes: { method: string; path: string }[];
  };
  AUTH_TEST_GOOGLE_CLIENT_ID: string;
} = await import(apiHarnessModule);

const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const KID = "integrity-fixture-key";
const AGE = { birthYear: 1990, country: "ZA", ageReached: false };

let h: Harness;
let app: ReturnType<typeof authTestApp>;
let signingKey: CryptoKey;
let publicJwk: Record<string, unknown>;

const b64url = (data: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof data === "string" ? data : new Uint8Array(data)).toString("base64url");

async function googleToken(claims: { sub: string; email: string; emailVerified?: boolean }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: AUTH_TEST_GOOGLE_CLIENT_ID,
      sub: claims.sub,
      email: claims.email,
      email_verified: claims.emailVerified ?? true,
      name: "Fixture Learner",
      iat: now,
      exp: now + 600,
    }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(signature)}`;
}

let serial = 0;
const unique = (label: string) => {
  serial += 1;
  return {
    email: `zz-social-${label}-${Date.now()}-${serial}@molo.local`,
    sub: `google-sub-${label}-${Date.now()}-${serial}`,
  };
};

function sessionCookie(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .join("; ");
}

async function signUpWithEmail(email: string) {
  const res = await app.request("/sign-up/email", {
    body: { email, password: "zz-integrity-password-1234", name: "Fixture Learner", ...AGE },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { user: { id: string } };
  return { userId: body.user.id, cookie: sessionCookie(res) };
}

async function usersWithEmail(email: string) {
  return h.db.select().from(schema.users).where(eq(schema.users.email, email));
}

async function providersOf(cookie: string): Promise<string[]> {
  const res = await app.request("/list-accounts", { cookie });
  expect(res.status).toBe(200);
  return ((await res.json()) as { providerId: string }[]).map((a) => a.providerId).sort();
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  signingKey = pair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), alg: "RS256" };
});

beforeEach(async () => {
  h ??= await harness();
  app ??= authTestApp(h.db);
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === GOOGLE_CERTS)
      return Response.json({ keys: [{ ...publicJwk, kid: KID, use: "sig" }] });
    // Nothing else may leave the process.
    throw new Error(`unexpected fetch in the social-linking test: ${url.split("?")[0]}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(async () => h?.close());

describe("social sign-in creates an account only when asked to", () => {
  it("refuses a new Google identity from a client that does not ask to sign up, and logs why", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const who = unique("implicit");
    const res = await app.request("/sign-in/social", {
      body: { provider: "google", idToken: { token: await googleToken(who) } },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      code: "OAUTH_LINK_ERROR",
      message: "signup disabled",
    });
    expect(await usersWithEmail(who.email)).toHaveLength(0);
    const lines = warn.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain(
      'auth.social_failed provider=google path=/sign-in/social status=401 code=OAUTH_LINK_ERROR reason="signup disabled"',
    );
    expect(lines.join("\n")).not.toContain(who.email);
  });

  it("creates the account on an explicit sign-up with the age declaration", async () => {
    const who = unique("explicit");
    const res = await app.request("/sign-in/social", {
      body: {
        provider: "google",
        idToken: { token: await googleToken(who) },
        requestSignUp: true,
        additionalData: { ageDeclaration: AGE },
      },
    });
    expect(res.status).toBe(200);
    const [user] = await usersWithEmail(who.email);
    expect(user).toMatchObject({ ageOk: true, agePending: false, country: "ZA" });
    // One step: the sign-up tab's account is usable at once.
    const cookie = sessionCookie(res);
    expect(await me(cookie)).toMatchObject({ ageRequired: false });
    expect((await app.api("/units", { cookie })).status).toBe(200);
  });

  it("refuses an under-age declaration on the sign-up tab before any account exists", async () => {
    const who = unique("underage-signup");
    const res = await app.request("/sign-in/social", {
      body: {
        provider: "google",
        idToken: { token: await googleToken(who) },
        requestSignUp: true,
        additionalData: {
          ageDeclaration: { birthYear: new Date().getUTCFullYear() - 10, country: "NO" },
        },
      },
    });
    expect(res.status).toBe(400);
    expect(await usersWithEmail(who.email)).toHaveLength(0);
  });
});

async function me(cookie: string) {
  const res = await app.api("/me", { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as { ageRequired: boolean; user: { id: string } } | null;
}

/** One tap on "Continue with Google" with no account yet: what every current client sends. */
async function oneTap(label: string) {
  const who = unique(label);
  const res = await app.request("/sign-in/social", {
    body: { provider: "google", idToken: { token: await googleToken(who) }, requestSignUp: true },
  });
  expect(res.status).toBe(200);
  const [user] = await usersWithEmail(who.email);
  return { who, userId: user!.id, cookie: sessionCookie(res) };
}

/**
 * Every API route a signed-in learner or editor can call, with its method.
 * The routes that load in this harness are read from the route tables
 * themselves; the rest (me.ts and the editor routes import WebAssembly) are
 * listed by hand and land on the harness's stand-in if the age step lets
 * them through.
 */
const PROTECTED: [string, string][] = [
  ["GET", "/me/progress"],
  ["PUT", "/me/prefs"],
  ["PUT", "/me/league-profile"],
  ["POST", "/me/push-token"],
  ["POST", "/me/import-progress"],
  ["POST", "/lessons/fixture/complete"],
  ["POST", "/path/chests/fixture/claim"],
  ["GET", "/me/hearts"],
  ["POST", "/me/hearts/lose"],
  ["GET", "/review/session"],
  ["POST", "/review/fixture"],
  ["GET", "/me/mistakes"],
  ["POST", "/me/mistakes/practise"],
  ["POST", "/exercises/fixture/report"],
  ["GET", "/units/fixture/crown"],
  ["GET", "/edit/queue"],
  ["GET", "/edit/preview/units"],
  ["GET", "/edit/lexemes"],
  ["GET", "/audio/queue"],
  ["GET", "/units"],
  ["GET", "/path"],
  ["GET", "/welcome"],
  ["GET", "/clicks"],
  ["GET", "/grammar"],
  ["GET", "/leagues/current"],
  ["GET", "/leagues/history"],
  ["GET", "/me/web-purchases"],
  ["POST", "/me/web-checkout"],
  ["POST", "/me/withdrawal"],
];
const OPEN = new Set([
  "GET /me",
  "POST /me/age",
  "POST /me/apple/authorization-code",
  "DELETE /me",
  "GET /me/export",
  "DELETE /me/push-token",
  "GET /health",
  "GET /auth/providers",
]);

describe("one tap on Apple or Google creates the account, behind the age step", () => {
  it("announces a member only after the age step, with no repeat on retry or sign-in", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const notifications = () =>
      log.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.startsWith("[slack dry-run] signups"));
    const { who, userId, cookie } = await oneTap("slack-age");
    expect(notifications()).toEqual([]);
    await h.db.insert(schema.userPrefs).values({ userId, sourceLang: "nb" });
    expect((await app.api("/me/age", { cookie, body: AGE })).status).toBe(200);
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0]).toMatch(
      /New member — Fixture · member #\d+ overall · via google · learns from nb/,
    );
    expect(notifications()[0]).not.toContain(who.email);
    await app.api("/me/age", { cookie, body: AGE });
    await app.request("/sign-in/social", {
      body: { provider: "google", idToken: { token: await googleToken(who) } },
    });
    expect(notifications()).toHaveLength(1);
  });

  it("announces age-approved email signup once, not later password or magic-link sign-ins", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const notifications = () =>
      log.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.startsWith("[slack dry-run] signups"));
    const email = unique("slack-email").email;
    await signUpWithEmail(email);
    expect(notifications()).toHaveLength(1);
    expect(notifications()[0]).toContain("via email · learns from en");
    expect(notifications()[0]).not.toContain(email);
    expect(
      (
        await app.request("/sign-in/email", {
          body: { email, password: "zz-integrity-password-1234" },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request("/sign-in/magic-link", {
          body: { email, callbackURL: "http://localhost:3300" },
        })
      ).status,
    ).toBe(200);
    const mail = log.mock.calls
      .map((c) => String(c[0]))
      .find((s) => s.startsWith("[email dry-run]") && s.includes("magic-link/verify"));
    expect(mail).toBeDefined();
    const link = new URL(
      mail!.match(/http:\/\/localhost:8787\/api\/auth\/magic-link\/verify\?[^\s]+/)![0],
    );
    expect((await app.request(link.pathname.replace("/api/auth", "") + link.search)).status).toBe(
      302,
    );
    expect(notifications()).toHaveLength(1);
  });

  it("never announces an abandoned or under-age one-tap account", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await oneTap("slack-abandoned");
    const { cookie } = await oneTap("slack-underage");
    expect(
      (
        await app.api("/me/age", {
          cookie,
          body: { birthYear: new Date().getUTCFullYear() - 10, country: "NO" },
        })
      ).status,
    ).toBe(403);
    expect(
      log.mock.calls
        .map((c) => String(c[0]))
        .filter((s) => s.startsWith("[slack dry-run] signups")),
    ).toEqual([]);
  });

  it("creates the account at once, with no eligibility and no country, and says the step is owed", async () => {
    const { who, cookie } = await oneTap("onetap");
    const [user] = await usersWithEmail(who.email);
    expect(user).toMatchObject({ ageOk: false, agePending: true, country: null });
    expect(await me(cookie)).toMatchObject({ ageRequired: true });
  });

  it("refuses every other route with 403 age_required until the step is done", async () => {
    const { cookie } = await oneTap("gated");
    for (const [method, path] of PROTECTED) {
      const res = await app.api(path, {
        cookie,
        method,
        ...(method === "GET" ? {} : { body: {} }),
      });
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await res.json(), `${method} ${path}`).toMatchObject({
        error: { code: "age_required" },
      });
    }
    // The learner keeps their rights over the account while the step is owed.
    for (const [method, path] of [
      ["GET", "/me/export"],
      ["DELETE", "/me"],
      ["DELETE", "/me/push-token"],
    ] as const) {
      const res = await app.api(path, { cookie, method });
      expect(res.status, `${method} ${path}`).toBe(200);
      expect(await res.json()).toEqual({ reachedHandler: true });
    }
    expect((await app.api("/auth/providers", { cookie })).status).toBe(200);
    // Signing out is Better Auth's and stays open.
    expect((await app.request("/sign-out", { cookie, body: {} })).status).toBe(200);
  });

  it("covers every route the loaded route tables define", async () => {
    const { routes } = app;
    const { cookie } = await oneTap("tables");
    expect(routes.length).toBeGreaterThan(5);
    for (const { method, path } of routes) {
      if (OPEN.has(`${method} ${path}`)) continue;
      const concrete = path.replace(/:[A-Za-z]+/g, "fixture");
      const res = await app.api(concrete, {
        cookie,
        method,
        ...(method === "GET" ? {} : { body: {} }),
      });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("unlocks the account on an adult declaration, keeping only eligibility and country", async () => {
    const { userId, cookie } = await oneTap("adult");
    const bad = await app.api("/me/age", { cookie, body: { country: "NO" } });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({
      error: { code: "age_invalid", details: { reason: "invalid" } },
    });
    const boundary = await app.api("/me/age", {
      cookie,
      body: { birthYear: new Date().getUTCFullYear() - 13, country: "NO" },
    });
    expect(await boundary.json()).toMatchObject({ error: { details: { reason: "confirm" } } });
    expect(await me(cookie)).toMatchObject({ ageRequired: true });

    const ok = await app.api("/me/age", {
      cookie,
      body: { birthYear: 1990, country: "NO", ageReached: false },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ageRequired: false });
    const [user] = await h.db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(user).toMatchObject({ ageOk: true, agePending: false, country: "NO" });
    // Nothing about the birth year exists on the row.
    expect(JSON.stringify(user)).not.toContain("1990");
    expect(await me(cookie)).toMatchObject({ ageRequired: false });
    expect((await app.api("/units", { cookie })).status).toBe(200);
    expect((await app.api("/leagues/current", { cookie })).status).not.toBe(403);
    // A second answer never rewrites the first.
    const again = await app.api("/me/age", {
      cookie,
      body: { birthYear: new Date().getUTCFullYear() - 5, country: "ZA" },
    });
    expect(await again.json()).toEqual({ ageRequired: false });
    const [still] = await h.db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(still).toMatchObject({ ageOk: true, country: "NO" });
  });

  it.each([
    ["NO", 10, "under13"],
    ["ZA", 16, "under18ZA"],
  ] as const)(
    "deletes the account and all its rows below the minimum age (%s, %i)",
    async (country, years, reason) => {
      const { who, userId, cookie } = await oneTap(`under-${country.toLowerCase()}`);
      await h.db.insert(schema.userPrefs).values({ userId }).onConflictDoNothing();
      const res = await app.api("/me/age", {
        cookie,
        body: { birthYear: new Date().getUTCFullYear() - years, country },
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({
        error: { code: "age_under_minimum", details: { reason } },
      });
      // The session cookie is expired in the same response.
      expect(res.headers.getSetCookie().join(";")).toMatch(/session_token=;/);
      expect(await usersWithEmail(who.email)).toHaveLength(0);
      for (const table of [schema.sessions, schema.accounts, schema.userRoles, schema.userPrefs])
        expect(await h.db.select().from(table).where(eq(table.userId, userId))).toHaveLength(0);
      expect(await me(cookie)).toBeNull();
    },
  );

  it("leaves accounts that never owed the step alone", async () => {
    const { cookie } = await signUpWithEmail(unique("email").email);
    expect(await me(cookie)).toMatchObject({ ageRequired: false });
    expect(await (await app.api("/me/age", { cookie, body: {} })).json()).toEqual({
      ageRequired: false,
    });
  });
});

describe("linking a provider to an existing account", () => {
  it("requires a session", async () => {
    const who = unique("nosession");
    const res = await app.request("/link-social", {
      body: { provider: "google", idToken: { token: await googleToken(who) } },
    });
    expect(res.status).toBe(401);
  });

  it("links a signed-in learner's Google account even when its e-mail differs", async () => {
    const owner = unique("owner");
    const { userId, cookie } = await signUpWithEmail(owner.email);
    // A different address, as Apple's private relay always is.
    const google = unique("relay");
    const token = await googleToken(google);
    const res = await app.request("/link-social", {
      cookie,
      body: { provider: "google", idToken: { token } },
    });
    expect(res.status).toBe(200);
    expect(await providersOf(cookie)).toEqual(["credential", "google"]);
    // The linked identity now signs in to the same account, without creating one.
    const signIn = await app.request("/sign-in/social", {
      body: { provider: "google", idToken: { token } },
    });
    expect(signIn.status).toBe(200);
    expect(((await signIn.json()) as { user: { id: string } }).user.id).toBe(userId);
    expect(await usersWithEmail(google.email)).toHaveLength(0);
  });

  it("refuses a provider e-mail the provider has not verified", async () => {
    const owner = unique("unverified-owner");
    const { cookie } = await signUpWithEmail(owner.email);
    const res = await app.request("/link-social", {
      cookie,
      body: {
        provider: "google",
        idToken: { token: await googleToken({ ...unique("unverified"), emailVerified: false }) },
      },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "LINKING_NOT_ALLOWED" });
    expect(await providersOf(cookie)).toEqual(["credential"]);
  });

  it("links implicitly on sign-in only when both e-mails are verified", async () => {
    const who = unique("implicit-link");
    const { userId, cookie } = await signUpWithEmail(who.email);
    const token = await googleToken(who);
    // The local address is not verified yet: no silent attachment.
    const refused = await app.request("/sign-in/social", {
      body: { provider: "google", idToken: { token } },
    });
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({
      code: "OAUTH_LINK_ERROR",
      message: "account not linked",
    });
    expect(await providersOf(cookie)).toEqual(["credential"]);
    await h.db.update(schema.users).set({ emailVerified: true }).where(eq(schema.users.id, userId));
    const linked = await app.request("/sign-in/social", {
      body: { provider: "google", idToken: { token } },
    });
    expect(linked.status).toBe(200);
    expect(((await linked.json()) as { user: { id: string } }).user.id).toBe(userId);
    expect(await providersOf(cookie)).toEqual(["credential", "google"]);
  });
});

describe("unlinking", () => {
  it("never removes the last way to sign in, and removes a second one", async () => {
    const owner = unique("unlink");
    const { cookie } = await signUpWithEmail(owner.email);
    const list = async () =>
      (await (await app.request("/list-accounts", { cookie })).json()) as {
        id: string;
        providerId: string;
      }[];
    const [credential] = await list();
    const last = await app.request("/unlink-account", {
      cookie,
      body: { accountId: credential!.id },
    });
    expect(last.status).toBe(400);
    expect(await last.json()).toMatchObject({ code: "FAILED_TO_UNLINK_LAST_ACCOUNT" });

    const link = await app.request("/link-social", {
      cookie,
      body: { provider: "google", idToken: { token: await googleToken(unique("second")) } },
    });
    expect(link.status).toBe(200);
    const google = (await list()).find((a) => a.providerId === "google")!;
    const removed = await app.request("/unlink-account", {
      cookie,
      body: { accountId: google.id },
    });
    expect(removed.status).toBe(200);
    expect(await providersOf(cookie)).toEqual(["credential"]);
  });
});
