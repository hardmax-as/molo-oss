import { createDb, type Db } from "@molo/db";
import { Data, Effect } from "effect";

import { type EnvName, type Globals } from "./root.ts";

export class CliError extends Data.TaggedError("CliError")<{ readonly message: string }> {}

export const fail = (message: string) => Effect.fail(new CliError({ message }));

/** Environment variable names per target. Values are never printed. */
export const ENV_VARS = {
  databaseUrl: {
    local: "DATABASE_URL",
    preview: "PREVIEW_DATABASE_URL",
    prod: "PROD_DATABASE_URL",
  },
  apiUrl: { local: "API_URL", preview: "PREVIEW_API_URL", prod: "PROD_API_URL" },
} as const;

export function envVar(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : undefined;
}

export function databaseUrl(env: EnvName): string | undefined {
  return envVar(ENV_VARS.databaseUrl[env]);
}

export function apiUrl(env: EnvName): string {
  return envVar(ENV_VARS.apiUrl[env]) ?? (env === "local" ? "http://localhost:8787" : "");
}

const RED = "[31m";
const BOLD = "[1m";
const RESET = "[0m";

export function banner(env: EnvName): void {
  if (env === "prod") {
    console.error(`${RED}${BOLD}=== PRODUCTION (${ENV_VARS.databaseUrl.prod}) ===${RESET}`);
  }
}

/** Every mutating command calls this: prints the plan, applies only with --live. */
export function gate(g: Globals, action: string): Effect.Effect<boolean, CliError> {
  return Effect.sync(() => {
    banner(g.env);
    if (!g.live) {
      console.log(`dry run: would ${action}. Re-run with --live to apply.`);
      return false;
    }
    if (g.env === "prod") console.error(`${RED}applying to production: ${action}${RESET}`);
    return true;
  });
}

/** Opens a database client for the target env; closed by the caller through `close`. */
export function openDb(
  g: Globals,
  max = 2,
): Effect.Effect<{ db: Db; close: () => Promise<void> }, CliError> {
  return Effect.gen(function* () {
    const url = databaseUrl(g.env);
    if (!url) return yield* fail(`${ENV_VARS.databaseUrl[g.env]} is not set`);
    banner(g.env);
    return createDb(url, { max });
  });
}

/** Runs `f` with a db client and closes it afterwards, whatever happens. */
export function withDb<A, E>(
  g: Globals,
  f: (db: Db) => Effect.Effect<A, E>,
): Effect.Effect<A, E | CliError> {
  return Effect.acquireUseRelease(
    openDb(g),
    ({ db }) => f(db),
    ({ close }) => Effect.promise(() => close().catch(() => undefined)),
  );
}

/** Print either JSON or the human rendering. */
export function out(g: Globals, data: unknown, human: () => void): Effect.Effect<void> {
  return Effect.sync(() => {
    if (g.json) console.log(JSON.stringify(data, null, 2));
    else human();
  });
}

export function table(rows: ReadonlyArray<Record<string, unknown>>): void {
  if (rows.length === 0) {
    console.log("(none)");
    return;
  }
  const first = rows[0] as Record<string, unknown>;
  const cols = Object.keys(first);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i] ?? 0)).join("  ");
  console.log(line(cols));
  console.log(line(widths.map((w) => "-".repeat(w))));
  for (const r of rows) console.log(line(cols.map((c) => String(r[c] ?? ""))));
}

export function kv(obj: Record<string, unknown>, indent = "  "): void {
  const w = Math.max(...Object.keys(obj).map((k) => k.length));
  for (const [k, v] of Object.entries(obj)) {
    console.log(
      `${indent}${k.padEnd(w)}  ${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
    );
  }
}

export const tryPromise = <A>(f: () => Promise<A>, what: string): Effect.Effect<A, CliError> =>
  Effect.tryPromise({
    try: f,
    catch: (e) =>
      new CliError({ message: `${what}: ${e instanceof Error ? e.message : String(e)}` }),
  });
