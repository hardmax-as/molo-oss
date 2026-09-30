/**
 * `molo dev` — helpers that only ever touch a local machine.
 *
 * `dev user` creates (or tops up) a test account through the running local
 * API's Better Auth sign-up endpoint, then grants the roles an admin would
 * grant in the dashboard. It refuses to run against anything but a local
 * database and a local API, so there is no path from here to a real user.
 * The password is a fixture value, not a secret: it exists so an operator
 * can sign into the web dashboard and the mobile app while developing.
 */

import { Args, Command, Options } from "@effect/cli";
import { schema } from "@molo/db";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { apiUrl, fail, gate, kv, out, withDb, databaseUrl } from "../context.ts";
import { molo } from "../root.ts";

const ROLES = ["learner", "editor", "admin"] as const;
type Role = (typeof ROLES)[number];

/** Hosts we accept: a dev machine and nothing else. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

export function isLocalUrl(raw: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

/** postgres://user:pass@host:port/db — the host is all we look at, never the credentials. */
export function isLocalDbUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

interface SignUpOutcome {
  readonly userId: string;
  readonly created: boolean;
}

/** Signs up through Better Auth so the password hash is the real one; tolerates an existing account. */
async function signUp(
  api: string,
  body: { email: string; password: string; name: string },
): Promise<{ ok: true; userId: string | null } | { ok: false; reason: string }> {
  let res: Response;
  try {
    res = await fetch(`${api}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, birthYear: 1990, country: "ZA" }),
    });
  } catch (e) {
    return { ok: false, reason: `cannot reach ${api} (${e instanceof Error ? e.message : e})` };
  }
  if (res.ok) {
    const json = (await res.json().catch(() => ({}))) as { user?: { id?: string } };
    return { ok: true, userId: json.user?.id ?? null };
  }
  const text = await res.text().catch(() => "");
  // Better Auth answers 422 USER_ALREADY_EXISTS; that is a success for a seeder.
  if (res.status === 422 || /already exists/i.test(text)) return { ok: true, userId: null };
  return { ok: false, reason: `sign-up failed (${res.status}) ${text.slice(0, 200)}` };
}

const user = Command.make(
  "user",
  {
    email: Args.text({ name: "email" }),
    password: Options.text("password").pipe(
      Options.withDefault("molo-dev-1234"),
      Options.withDescription("Local fixture password (min 10 chars)"),
    ),
    name: Options.text("name").pipe(
      Options.withDefault("Dev Admin"),
      Options.withDescription("Display name"),
    ),
    role: Options.choice("role", ROLES).pipe(
      Options.withDefault("admin" as Role),
      Options.withDescription("Highest role to grant; admin implies editor and learner"),
    ),
  },
  ({ email, password, name, role }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const api = apiUrl(g.env);
      const dbUrl = databaseUrl(g.env);
      if (g.env !== "local") return yield* fail("dev user is local-only (drop --env)");
      if (!dbUrl) return yield* fail("DATABASE_URL is not set (molo doctor)");
      if (!isLocalDbUrl(dbUrl)) return yield* fail("DATABASE_URL does not point at a local host");
      if (!isLocalUrl(api)) return yield* fail(`API_URL (${api}) does not point at a local host`);
      // Better Auth is configured with minPasswordLength 10 (apps/api/src/auth.ts).
      if (password.length < 10) return yield* fail("password must be at least 10 characters");

      const roles: Role[] =
        role === "admin"
          ? ["admin", "editor", "learner"]
          : role === "editor"
            ? ["editor", "learner"]
            : ["learner"];

      const apply = yield* gate(
        g,
        `create ${email} on ${api} with roles ${roles.join(", ")} (password: ${password})`,
      );
      if (!apply) return;

      const result: SignUpOutcome = yield* withDb(g, (db) =>
        Effect.gen(function* () {
          const signed = yield* Effect.promise(() => signUp(api, { email, password, name }));
          if (!signed.ok) return yield* fail(signed.reason);
          const rows = yield* Effect.promise(() =>
            db
              .select({ id: schema.users.id })
              .from(schema.users)
              .where(eq(schema.users.email, email)),
          );
          const found = rows[0]?.id;
          if (!found) return yield* fail(`signed up but no user row for ${email}`);
          yield* Effect.promise(() =>
            db
              .insert(schema.userRoles)
              .values(roles.map((r) => ({ userId: found, role: r })))
              .onConflictDoNothing(),
          );
          return { userId: found, created: signed.userId !== null };
        }),
      );

      yield* out(g, { email, password, roles, ...result }, () =>
        kv({
          email,
          password,
          roles: roles.join(", "),
          userId: result.userId,
          account: result.created ? "created" : "already existed (roles topped up)",
        }),
      );
    }),
).pipe(
  Command.withDescription(
    "Create a local test account with roles through the running local API (--live)",
  ),
);

export const dev = Command.make("dev").pipe(
  Command.withDescription("Local-only helpers; refuses any non-local target"),
  Command.withSubcommands([user]),
);
