import { existsSync } from "node:fs";
import { join } from "node:path";

import { Command } from "@effect/cli";
import { createDb } from "@molo/db";
import { Effect } from "effect";

import { ENV_VARS, apiUrl, databaseUrl, envVar, out, table } from "../context.ts";
import { molo } from "../root.ts";
import { morphPkgDir } from "../services/morph.ts";
import { binPath } from "../services/repo-paths.ts";
import { S3_VARS, s3Client, s3Config } from "../services/s3.ts";

interface Check {
  readonly name: string;
  readonly kind: "credential" | "service" | "tool";
  readonly ok: boolean;
  readonly required: boolean;
  readonly detail: string;
}

const cred = (name: string, required = false): Check => ({
  name,
  kind: "credential",
  ok: envVar(name) !== undefined,
  required,
  detail: envVar(name) !== undefined ? "set" : "missing",
});

async function checkPostgres(url: string | undefined): Promise<Check> {
  if (!url)
    return {
      name: "postgres",
      kind: "service",
      ok: false,
      required: true,
      detail: "no database url for this env",
    };
  const { db, close } = createDb(url, { max: 1 });
  try {
    const { sql } = await import("drizzle-orm");
    const rows = (await db.execute(
      sql`select current_database() as db, (select count(*)::int from lexemes) as lexemes`,
    )) as unknown as { db: string; lexemes: number }[];
    const r = rows[0];
    return {
      name: "postgres",
      kind: "service",
      ok: true,
      required: true,
      detail: `reachable; db=${r?.db} lexemes=${r?.lexemes}`,
    };
  } catch (e) {
    return {
      name: "postgres",
      kind: "service",
      ok: false,
      required: true,
      detail: e instanceof Error ? (e.message.split("\n")[0] ?? "") : String(e),
    };
  } finally {
    await close().catch(() => undefined);
  }
}

async function checkS3(env: "local" | "preview" | "prod"): Promise<Check> {
  const cfg = s3Config(env);
  const vars = (env === "local" ? S3_VARS.local : S3_VARS.remote).join(", ");
  if (!cfg)
    return {
      name: "object storage",
      kind: "service",
      ok: false,
      required: false,
      detail: `not configured (${vars})`,
    };
  try {
    const client = s3Client(cfg, cfg.privateBucket);
    const listing = await client.list({ maxKeys: 1 });
    return {
      name: "object storage",
      kind: "service",
      ok: true,
      required: false,
      detail: `reachable; ${cfg.privateBucket} has ${listing.keyCount ?? 0}+ objects`,
    };
  } catch (e) {
    return {
      name: "object storage",
      kind: "service",
      ok: false,
      required: false,
      detail: e instanceof Error ? (e.message.split("\n")[0] ?? "") : String(e),
    };
  }
}

async function checkApi(url: string): Promise<Check> {
  if (!url)
    return {
      name: "api",
      kind: "service",
      ok: false,
      required: false,
      detail: "no API url for this env",
    };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { ok?: boolean; environment?: string; database?: string };
    return {
      name: "api",
      kind: "service",
      ok: res.ok && body.ok === true,
      required: false,
      detail: `${res.status} env=${body.environment} db=${body.database}`,
    };
  } catch (e) {
    return {
      name: "api",
      kind: "service",
      ok: false,
      required: false,
      detail: `${url}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function version(cmd: string[]): Promise<string | null> {
  try {
    const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const text = await new Response(p.stdout).text();
    return (await p.exited) === 0 ? (text.trim().split("\n")[0] ?? null) : null;
  } catch {
    return null;
  }
}

export const doctor = Command.make("doctor", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    const checks: Check[] = [];

    checks.push(cred(ENV_VARS.databaseUrl[g.env], true));
    for (const v of ["BETTER_AUTH_SECRET", "AUDIO_SIGNING_SECRET"]) checks.push(cred(v));
    for (const v of g.env === "local" ? S3_VARS.local : S3_VARS.remote) checks.push(cred(v));
    for (const v of [
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ACCOUNT_ID",
      "QUEUE_AUDIO_PROCESS_ID",
      "SENTRY_DSN",
      "SENTRY_AUTH_TOKEN",
      "SENTRY_READ_TOKEN",
      "SENTRY_ORG",
      "SENTRY_PROJECT",
      "RESEND_API_KEY",
      "EXPO_ACCESS_TOKEN",
      "FORVO_API_KEY",
      "GOOGLE_TRANSLATE_API_KEY",
      "LINEAR_API_KEY",
      "SLACK_WEBHOOK_URL",
      "SLACK_SIGNUPS_WEBHOOK_URL",
      "SLACK_SUBSCRIPTIONS_WEBHOOK_URL",
    ])
      checks.push(cred(v));

    const [pg, s3, api] = yield* Effect.promise(() =>
      Promise.all([checkPostgres(databaseUrl(g.env)), checkS3(g.env), checkApi(apiUrl(g.env))]),
    );
    checks.push(pg, s3, api);

    const [bun, cargo, rustc, wrangler, ffmpeg] = yield* Effect.promise(() =>
      Promise.all([
        version(["bun", "--version"]),
        version(["cargo", "--version"]),
        version(["rustc", "--version"]),
        version(["bunx", "wrangler", "--version"]),
        version(["ffmpeg", "-version"]),
      ]),
    );
    checks.push({ name: "bun", kind: "tool", ok: !!bun, required: true, detail: bun ?? "missing" });
    checks.push({
      name: "cargo",
      kind: "tool",
      ok: !!cargo,
      required: false,
      detail: cargo ?? "missing",
    });
    checks.push({
      name: "rustc",
      kind: "tool",
      ok: !!rustc,
      required: false,
      detail: rustc ?? "missing",
    });
    checks.push({
      name: "wrangler",
      kind: "tool",
      ok: !!wrangler,
      required: false,
      detail: wrangler ?? "missing",
    });
    checks.push({
      name: "ffmpeg",
      kind: "tool",
      ok: !!ffmpeg,
      required: false,
      detail: ffmpeg ?? "missing (recording brief stand-in)",
    });
    const xhAudio = binPath("xh-audio");
    checks.push({
      name: "xh-audio binary",
      kind: "tool",
      ok: existsSync(xhAudio),
      required: false,
      detail: existsSync(xhAudio)
        ? xhAudio
        : `not built (${xhAudio}); molo audio process builds it`,
    });
    const morphWasm = join(morphPkgDir(), "xh_morph_bg.wasm");
    checks.push({
      name: "xh-morph wasm",
      kind: "tool",
      ok: existsSync(morphWasm),
      required: false,
      detail: existsSync(morphWasm) ? morphWasm : "not built; see crates/xh-morph/README.md",
    });

    const failedRequired = checks.filter((c) => c.required && !c.ok);
    const summary = { env: g.env, ok: failedRequired.length === 0, checks };
    yield* out(g, summary, () => {
      console.log(`molo doctor (${g.env}) ${summary.ok ? "OK" : "PROBLEMS"}`);
      table(
        checks.map((c) => ({
          status: c.ok ? "ok" : c.required ? "FAIL" : "--",
          kind: c.kind,
          name: c.name,
          detail: c.detail,
        })),
      );
      console.log("\nCredential rows report presence only; values are never printed.");
    });
    if (!summary.ok) process.exitCode = 1;
  }),
).pipe(
  Command.withDescription(
    "Which credentials resolve and which services are reachable (never values)",
  ),
);
