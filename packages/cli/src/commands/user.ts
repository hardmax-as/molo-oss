/**
 * `molo user` — roles on real accounts, in any environment.
 *
 * The dashboard grants editor and admin, but the first admin has to come from
 * somewhere: the operator signs up like any learner, then `molo user role
 * <email> --role admin --env prod --live` promotes that account. The command
 * never creates accounts and never touches passwords; it only reads the user
 * row by email and writes `user_roles`.
 *
 * `prune-pending` is the nightly cron's age-step cleanup, runnable by hand:
 * one-tap sign-ups that never answered the age step are deleted after the
 * retention the privacy policy states, in the same order as the API (revoke
 * the Apple grant, then delete). The dry run prints counts only.
 */

import { Args, Command, Options } from "@effect/cli";
import {
  AGE_PENDING_RETENTION_DAYS,
  agePendingCutoff,
  appleClients,
  revokeAppleTokens,
} from "@molo/core";
import {
  appleAccountTokens,
  countAppleTokenHolders,
  deleteUserAccount,
  isAgePending,
  schema,
  staleAgePendingUserIds,
} from "@molo/db";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { envVar, fail, gate, kv, out, withDb } from "../context.ts";
import { molo } from "../root.ts";

const ROLES = ["learner", "editor", "admin"] as const;
type Role = (typeof ROLES)[number];

/** admin implies editor and learner; editor implies learner. */
export function impliedRoles(role: Role): Role[] {
  return role === "admin"
    ? ["admin", "editor", "learner"]
    : role === "editor"
      ? ["editor", "learner"]
      : ["learner"];
}

const grantRole = Command.make(
  "role",
  {
    email: Args.text({ name: "email" }),
    role: Options.choice("role", ROLES).pipe(
      Options.withDefault("admin" as Role),
      Options.withDescription("Highest role to grant; admin implies editor and learner"),
    ),
  },
  ({ email, role }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const roles = impliedRoles(role);
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const rows = yield* Effect.promise(() =>
            db
              .select({ id: schema.users.id, name: schema.users.name })
              .from(schema.users)
              .where(eq(schema.users.email, email)),
          );
          const found = rows[0];
          if (!found) return yield* fail(`no account with email ${email}; sign up first`);
          const apply = yield* gate(
            g,
            `grant ${roles.join(", ")} to ${email} (${found.id}) on ${g.env}`,
          );
          if (!apply) return;
          yield* Effect.promise(() =>
            db
              .insert(schema.userRoles)
              .values(roles.map((r) => ({ userId: found.id, role: r })))
              .onConflictDoNothing(),
          );
          const have = yield* Effect.promise(() =>
            db
              .select({ role: schema.userRoles.role })
              .from(schema.userRoles)
              .where(eq(schema.userRoles.userId, found.id)),
          );
          const result = { email, userId: found.id, roles: have.map((r) => r.role).sort() };
          yield* out(g, result, () => kv({ ...result, roles: result.roles.join(", ") }));
        }),
      );
    }),
).pipe(Command.withDescription("Grant roles to an existing account by email (--live)"));

const show = Command.make("show", { email: Args.text({ name: "email" }) }, ({ email }) =>
  Effect.gen(function* () {
    const g = yield* molo;
    yield* withDb(g, (db) =>
      Effect.gen(function* () {
        const rows = yield* Effect.promise(() =>
          db
            .select({
              id: schema.users.id,
              name: schema.users.name,
              emailVerified: schema.users.emailVerified,
              createdAt: schema.users.createdAt,
            })
            .from(schema.users)
            .where(eq(schema.users.email, email)),
        );
        const found = rows[0];
        if (!found) return yield* fail(`no account with email ${email}`);
        const have = yield* Effect.promise(() =>
          db
            .select({ role: schema.userRoles.role })
            .from(schema.userRoles)
            .where(eq(schema.userRoles.userId, found.id)),
        );
        const result = {
          email,
          userId: found.id,
          name: found.name,
          emailVerified: found.emailVerified,
          createdAt: found.createdAt.toISOString(),
          roles: have.map((r) => r.role).sort(),
        };
        yield* out(g, result, () => kv({ ...result, roles: result.roles.join(", ") || "(none)" }));
      }),
    );
  }),
).pipe(Command.withDescription("Show an account and its roles"));

/** "7d" or "7" → 7. Days only: the retention is stated in days. */
export function parseOlderThan(raw: string): number | null {
  const m = /^(\d{1,4})d?$/.exec(raw.trim());
  if (!m) return null;
  const days = Number(m[1]);
  return days >= 1 ? days : null;
}

const prunePending = Command.make(
  "prune-pending",
  {
    olderThan: Options.text("older-than").pipe(
      Options.withDefault(`${AGE_PENDING_RETENTION_DAYS}d`),
      Options.withDescription("Delete age-pending accounts created longer ago than this (days)"),
    ),
  },
  ({ olderThan }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const days = parseOlderThan(olderThan);
      if (days === null) return yield* fail("--older-than must be a number of days, like 7d");
      const cutoff = agePendingCutoff(new Date(), days);
      // The same Apple credentials the Worker has; without them a grant stays with Apple.
      const clients = appleClients({
        APPLE_CLIENT_ID: envVar("APPLE_CLIENT_ID"),
        APPLE_CLIENT_SECRET: envVar("APPLE_CLIENT_SECRET"),
        APPLE_APP_BUNDLE_IDENTIFIER: envVar("APPLE_APP_BUNDLE_IDENTIFIER"),
        APPLE_APP_CLIENT_SECRET: envVar("APPLE_APP_CLIENT_SECRET"),
      });
      yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const ids = yield* Effect.promise(() => staleAgePendingUserIds(db, cutoff));
          const withApple = yield* Effect.promise(() => countAppleTokenHolders(db, ids));
          // Counts only: no id, name or e-mail of an account about to be deleted.
          const plan = {
            env: g.env,
            olderThanDays: days,
            createdBefore: cutoff.toISOString(),
            accounts: ids.length,
            withAppleToken: withApple,
            appleClients: clients.map((c) => c.clientId),
          };
          yield* out(g, plan, () =>
            kv({ ...plan, appleClients: plan.appleClients.join(", ") || "(none configured)" }),
          );
          if (withApple > 0 && clients.length === 0)
            console.warn(
              "no Apple client credentials in the environment: those grants would not be revoked",
            );
          if (ids.length === 0) return;
          const apply = yield* gate(
            g,
            `delete ${ids.length} age-pending account(s) older than ${days} days on ${g.env}`,
          );
          if (!apply) return;
          let deleted = 0;
          let revoked = 0;
          let revokeFailed = 0;
          for (const id of ids) {
            // Re-read: an account that answered the step since the list was taken stays.
            if (!(yield* Effect.promise(() => isAgePending(db, id)))) continue;
            const rows = yield* Effect.promise(() => appleAccountTokens(db, id));
            if (rows.length > 0) {
              const r = yield* Effect.promise(() =>
                revokeAppleTokens(rows, clients, (req, ms) =>
                  fetch(req.url, { ...req.init, signal: AbortSignal.timeout(ms) }),
                ),
              );
              revoked += r.revoked;
              revokeFailed += r.failed;
              for (const f of r.failures)
                console.warn(`auth.apple_revoke_failed client=${f.clientId} status=${f.status}`);
            }
            yield* Effect.promise(() => deleteUserAccount(db, id));
            deleted++;
          }
          const result = { deleted, appleRevoked: revoked, appleRevokeFailed: revokeFailed };
          yield* out(g, result, () => kv(result));
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Delete one-tap sign-ups that never answered the age step (default older than 7d; --live)",
  ),
);

export const user = Command.make("user").pipe(
  Command.withDescription("Accounts and roles: show, role, prune-pending"),
  Command.withSubcommands([show, grantRole, prunePending]),
);
