/**
 * Vitest global setup for the integrity project: makes sure the sibling test
 * database exists and has migrations applied. The suite truncates content
 * tables, so it must never point at the development database (helpers.ts).
 */
import { runMigrations } from "@molo/db/migrate";
import postgres from "postgres";

import { testDatabaseUrl } from "./helpers.ts";

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");
  if (!/^[a-z_][a-z0-9_]*$/.test(dbName))
    throw new Error(`refusing odd test database name ${dbName}`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`select 1 from pg_database where datname = ${dbName}`;
    if (rows.length === 0) await sql.unsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await sql.end({ timeout: 5 });
  }
  await runMigrations(url);
}
