/**
 * Read-only operational queries over Postgres statistics views, for
 * `molo db activity|slow|query`. System catalogs only; no application table
 * is read here. Every statement runs in a READ ONLY transaction.
 */
import postgres from "postgres";

import { forPostgresJs } from "./client.ts";

/**
 * Runs one statement inside a READ ONLY transaction on its own connection and
 * closes it. `molo db query` uses the same path for anything it reads.
 */
export async function readOnlyRows(
  url: string,
  statement: string,
  limit = Number.POSITIVE_INFINITY,
): Promise<Record<string, unknown>[]> {
  const sql = postgres(forPostgresJs(url), { max: 1, onnotice: () => {} });
  try {
    return await sql.begin("read only", async (tx) => {
      const r = await tx.unsafe(statement);
      return Array.from(r as unknown as Iterable<Record<string, unknown>>).slice(0, limit);
    });
  } finally {
    await sql.end();
  }
}

export const ACTIVITY_SQL = `
select pid,
       backend_type,
       coalesce(application_name, '') as application,
       coalesce(state, '') as state,
       coalesce(wait_event_type || ':' || wait_event, '') as wait_event,
       extract(epoch from (now() - query_start))::float8 as query_seconds,
       extract(epoch from (now() - xact_start))::float8 as xact_seconds,
       coalesce(query, '') as query
  from pg_stat_activity
 where pid <> pg_backend_pid()
   and datname = current_database()
 order by query_start nulls last`;

export const STATEMENTS_EXTENSION_SQL = `
select (select extversion from pg_extension where extname = 'pg_stat_statements') as installed,
       (select default_version from pg_available_extensions where name = 'pg_stat_statements') as available`;

export const SLOW_ORDER = {
  total: "total_exec_time",
  mean: "mean_exec_time",
  calls: "calls",
} as const;
export type SlowOrder = keyof typeof SLOW_ORDER;

export function slowSql(order: SlowOrder, limit: number): string {
  const n = Math.max(1, Math.min(500, Math.trunc(limit)));
  return `
select calls::int8 as calls,
       round(total_exec_time::numeric, 1)::float8 as total_ms,
       round(mean_exec_time::numeric, 2)::float8 as mean_ms,
       round(max_exec_time::numeric, 1)::float8 as max_ms,
       rows::int8 as rows,
       query
  from pg_stat_statements
 where dbid = (select oid from pg_database where datname = current_database())
 order by ${SLOW_ORDER[order]} desc
 limit ${n}`;
}
