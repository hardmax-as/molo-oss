#!/usr/bin/env bun
/**
 * Applies ./drizzle migrations to DATABASE_URL. Idempotent.
 * `bun run db:migrate` from the repo root.
 *
 * The deploy runs this against production before Alchemy ships the new
 * code, so `pendingMigrations` and `destructiveStatements` exist for the
 * CLI to refuse a migration that would drop or retype anything without a
 * person saying so: an automatic deploy may only ever run additive SQL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDb, databaseUrlFromEnv } from "./client.ts";

const MIGRATIONS_DIR = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function runMigrations(url: string): Promise<void> {
  const { db, close } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await close();
  }
}

export interface JournalEntry {
  readonly idx: number;
  readonly tag: string;
  readonly when: number;
}

export interface PendingMigration extends JournalEntry {
  readonly sql: string;
  /** The statements `destructiveStatements` flagged; empty means additive. */
  readonly destructive: ReadonlyArray<string>;
}

/**
 * The journal entries Drizzle's migrator would apply: those newer than the
 * last `created_at` it recorded (drizzle-orm pg-core dialect, `migrate`).
 * `lastApplied` is null on an empty database, and then everything is pending.
 */
export function pendingFromJournal(
  entries: ReadonlyArray<JournalEntry>,
  lastApplied: number | null,
): JournalEntry[] {
  return entries.filter((e) => lastApplied === null || e.when > lastApplied);
}

/**
 * Statements that lose data or break the code still running during a
 * rolling deploy. Drizzle writes one statement per `--> statement-breakpoint`
 * and upper-cases keywords, but the match is case-insensitive anyway.
 */
const DESTRUCTIVE = [
  /\bDROP\s+(TABLE|COLUMN|SCHEMA|TYPE|INDEX)\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+COLUMN\s+"?[\w]+"?\s+(SET\s+DATA\s+)?TYPE\b/i,
  /\bRENAME\s+(TO|COLUMN)\b/i,
  /^\s*DELETE\s+FROM\b/i,
];

export function destructiveStatements(text: string): string[] {
  return text
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter((s) => s !== "" && DESTRUCTIVE.some((re) => re.test(s)))
    .map((s) => s.replace(/\s+/g, " ").slice(0, 120));
}

/** Reads the journal and the database, and pairs each pending entry with its SQL. */
export async function pendingMigrations(url: string): Promise<PendingMigration[]> {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  ) as {
    entries: JournalEntry[];
  };
  const { db, close } = createDb(url, { max: 1 });
  let lastApplied: number | null = null;
  try {
    // Drizzle's own bookkeeping; absent on a database that has never been migrated.
    const [exists] = await db.execute<{ present: boolean }>(
      sql`select to_regclass('drizzle.__drizzle_migrations') is not null as present`,
    );
    if (exists?.present) {
      const [row] = await db.execute<{ created_at: string | null }>(
        sql`select max(created_at)::text as created_at from drizzle.__drizzle_migrations`,
      );
      lastApplied = row?.created_at ? Number(row.created_at) : null;
    }
  } finally {
    await close();
  }
  return pendingFromJournal(journal.entries, lastApplied).map((e) => {
    const text = readFileSync(join(MIGRATIONS_DIR, `${e.tag}.sql`), "utf8");
    return { ...e, sql: text, destructive: destructiveStatements(text) };
  });
}

if (import.meta.main) {
  const url = databaseUrlFromEnv();
  await runMigrations(url);
  console.log(`migrations applied to ${new URL(url).host}`);
}
