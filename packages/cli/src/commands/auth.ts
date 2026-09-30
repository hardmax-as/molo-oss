/**
 * `molo auth` — credentials the sign-in providers need from us.
 *
 * `auth apple-secret` turns a Sign in with Apple key (.p8) into the JWT
 * Better Auth uses as `APPLE_CLIENT_SECRET`. Apple accepts it for at most
 * six months, so this runs again before every expiry. `--target app` signs
 * the second one, `APPLE_APP_CLIENT_SECRET`, for the iOS bundle id: Apple
 * binds a client secret to one client id, and the native sheet's tokens
 * belong to the bundle id, so exchanging and revoking them needs its own. The secret itself is
 * never printed: the dry run shows the claims and the destinations, and
 * --live writes `.env` and the GitHub Actions secret (through `gh`).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";

import { fail, gate, kv, out, tryPromise } from "../context.ts";
import { molo } from "../root.ts";
import {
  MAX_DAYS,
  appleSecretClaims,
  makeAppleClientSecret,
  upsertDotenv,
} from "../services/apple-secret.ts";
import { repoRoot } from "../services/repo-paths.ts";

async function ghSecretSet(repo: string, name: string, value: string): Promise<void> {
  const proc = Bun.spawn(["gh", "secret", "set", name, "-R", repo], {
    stdin: new TextEncoder().encode(value),
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`gh secret set ${name} failed (${code}): ${err.trim().slice(0, 200)}`);
  }
}

const appleSecret = Command.make(
  "apple-secret",
  {
    key: Options.file("key").pipe(
      Options.withDescription("Path to the Sign in with Apple key (.p8); not stored anywhere"),
    ),
    keyId: Options.text("key-id").pipe(Options.withDescription("The key's 10-character id")),
    teamId: Options.text("team-id").pipe(
      Options.withDefault("QS22KUQ4QT"),
      Options.withDescription("Apple Developer team id"),
    ),
    target: Options.choice("target", ["web", "app"] as const).pipe(
      Options.withDefault("web" as const),
      Options.withDescription(
        "web: the Services ID secret (APPLE_CLIENT_ID + APPLE_CLIENT_SECRET); app: the bundle id secret (APPLE_APP_CLIENT_SECRET)",
      ),
    ),
    clientIdOption: Options.text("client-id").pipe(
      Options.optional,
      Options.withDescription(
        "Client id the secret is signed for (default com.hardmax.molo.web, or com.hardmax.molo with --target app)",
      ),
    ),
    days: Options.integer("days").pipe(
      Options.withDefault(MAX_DAYS),
      Options.withDescription(`Validity in days, at most ${MAX_DAYS}`),
    ),
    dotenv: Options.text("dotenv").pipe(
      Options.optional,
      Options.withDescription("dotenv file to update (default: <repo>/.env)"),
    ),
    repo: Options.text("repo").pipe(
      Options.optional,
      Options.withDescription("GitHub repo for `gh secret set`; omit to skip GitHub"),
    ),
  },
  ({ key, keyId, teamId, target, clientIdOption, days, dotenv, repo }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const clientId = Option.getOrElse(clientIdOption, () =>
        target === "app" ? "com.hardmax.molo" : "com.hardmax.molo.web",
      );
      const entries = (jwt: string): Record<string, string> =>
        target === "app"
          ? { APPLE_APP_CLIENT_SECRET: jwt }
          : { APPLE_CLIENT_ID: clientId, APPLE_CLIENT_SECRET: jwt };
      const names = Object.keys(entries("")).join(" + ");
      const claims = yield* Effect.try({
        try: () => appleSecretClaims({ keyId, teamId, clientId, days }),
        catch: (e) => e as Error,
      }).pipe(Effect.catchAll((e) => fail(e.message)));
      const envPath = Option.getOrElse(dotenv, () => join(repoRoot(), ".env"));
      const ghRepo = Option.getOrUndefined(repo);
      const plan = {
        keyId,
        teamId,
        clientId,
        expires: new Date(claims.exp * 1000).toISOString().slice(0, 10),
        dotenv: envPath,
        github: ghRepo ? `${ghRepo}: ${names}` : "(skipped)",
      };
      yield* out(g, plan, () => kv(plan));
      const apply = yield* gate(
        g,
        `sign the Apple client secret for ${clientId} and write ${names} to ${envPath}${ghRepo ? ` and ${ghRepo}` : ""}`,
      );
      if (!apply) return;
      if (!existsSync(key)) return yield* fail(`no such key file: ${key}`);
      const pem = readFileSync(key, "utf8");
      const jwt = yield* tryPromise(
        () => makeAppleClientSecret({ pem, keyId, teamId, clientId, days }),
        "signing",
      );
      const body = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
      const values = entries(jwt);
      writeFileSync(envPath, upsertDotenv(body, values));
      if (ghRepo) {
        for (const [name, value] of Object.entries(values))
          yield* tryPromise(() => ghSecretSet(ghRepo, name, value), "gh");
      }
      console.log(
        `wrote ${names} (expires ${plan.expires}); deploy to apply. Put a reminder in before then.`,
      );
    }),
).pipe(
  Command.withDescription(
    "Sign the Sign in with Apple client secret from a .p8 key (--live writes .env and GitHub)",
  ),
);

export const auth = Command.make("auth").pipe(
  Command.withDescription("Sign-in provider credentials: apple-secret"),
  Command.withSubcommands([appleSecret]),
);
