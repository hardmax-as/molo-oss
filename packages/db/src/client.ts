import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.ts";

export type Db = PostgresJsDatabase<typeof schema>;

export interface ClientOptions {
  /** Max pooled connections. Workers behind Hyperdrive want 1; scripts can take more. */
  readonly max?: number;
  /** Prepared statements are off by default: Hyperdrive and PgBouncer-style poolers reject them. */
  readonly prepare?: boolean;
  /** Optional statement observer; parameters are deliberately not forwarded. */
  readonly onQuery?: (query: string) => void;
}

/**
 * libpq options that postgres.js does not know. It forwards any query
 * parameter it does not recognise to the server as a session setting, and
 * Postgres answers `unrecognized configuration parameter "sslrootcert"`
 * (42704) before the first query runs. PlanetScale's connection URI carries
 * `sslrootcert=system`; psql wants it, this driver does not. `sslmode` is
 * kept: postgres.js honours it, and verify-full against the system roots is
 * exactly what the hosted database needs.
 */
const LIBPQ_ONLY = new Set(["sslrootcert", "sslcert", "sslkey", "sslnegotiation", "sslcrl"]);

/** The same URL without the parameters only libpq understands. */
export function forPostgresJs(url: string): string {
  const parsed = new URL(url);
  let dropped = false;
  for (const key of LIBPQ_ONLY) {
    if (!parsed.searchParams.has(key)) continue;
    parsed.searchParams.delete(key);
    dropped = true;
  }
  return dropped ? parsed.toString() : url;
}

/**
 * Creates a Drizzle client over postgres.js. Works locally against Docker
 * Postgres, on Workers through Hyperdrive's connection string, and on Bun for
 * scripts. Provider-agnostic on purpose (STACK.md).
 */
export function createDb(
  url: string,
  options: ClientOptions = {},
): { db: Db; close: () => Promise<void> } {
  const sql = postgres(forPostgresJs(url), {
    max: options.max ?? 1,
    prepare: options.prepare ?? false,
    onnotice: () => {},
  });
  const db = drizzle(sql, {
    schema,
    casing: "snake_case",
    logger: options.onQuery ? { logQuery: (query) => options.onQuery?.(query) } : false,
  });
  return { db, close: () => sql.end({ timeout: 5 }) };
}

export function databaseUrlFromEnv(env: Record<string, string | undefined> = process.env): string {
  const url = env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}
