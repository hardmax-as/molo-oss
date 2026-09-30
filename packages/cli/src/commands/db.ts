import { fileURLToPath } from "node:url";

import { Args, Command, Options } from "@effect/cli";
import { forPostgresJs } from "@molo/db/client";
import { pendingMigrations, runMigrations } from "@molo/db/migrate";
import {
  ACTIVITY_SQL,
  SLOW_ORDER,
  STATEMENTS_EXTENSION_SQL,
  readOnlyRows,
  slowSql,
  type SlowOrder,
} from "@molo/db/pg-stats";
import { Effect } from "effect";
import postgres from "postgres";

import { banner, databaseUrl, fail, gate, out, table, tryPromise } from "../context.ts";
import { molo } from "../root.ts";
import { toActivity, toSlow } from "../services/pg-stats.ts";

const READ_ONLY_PREFIX = /^\s*(select|with|explain|show|values|table)\b/i;

/**
 * The deploy runs this against production before the new code ships, so by
 * default it applies additive SQL only: a pending migration that drops,
 * retypes, renames or truncates needs a person to pass --allow-destructive
 * from a laptop. The dry run lists what is pending either way.
 */
const migrate = Command.make(
  "migrate",
  {
    allowDestructive: Options.boolean("allow-destructive").pipe(
      Options.withDescription("Apply pending migrations that drop, retype, rename or truncate"),
    ),
  },
  ({ allowDestructive }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const url = databaseUrl(g.env);
      if (!url) return yield* fail(`no database url for env ${g.env}`);
      const host = new URL(url).host;
      const pending = yield* tryPromise(() => pendingMigrations(url), "migrate");
      const rows = pending.map((m) => ({
        migration: m.tag,
        destructive: m.destructive.length > 0 ? m.destructive.join(" | ") : "",
      }));
      yield* out(g, { host, pending: rows, applied: false }, () => {
        if (pending.length === 0) console.log(`nothing pending on ${host}`);
        else {
          console.log(`pending on ${host}:`);
          table(rows);
        }
      });
      if (pending.length === 0) return;
      const blocked = pending.filter((m) => m.destructive.length > 0);
      if (blocked.length > 0 && !allowDestructive)
        return yield* fail(
          `${blocked.map((m) => m.tag).join(", ")} would drop, retype, rename or truncate; ` +
            "re-run with --allow-destructive from a laptop, never from the deploy",
        );
      const apply = yield* gate(
        g,
        `apply ${pending.length} migration(s) [${pending.map((m) => m.tag).join(", ")}] to ${host}`,
      );
      if (!apply) return;
      yield* tryPromise(() => runMigrations(url), "migrate");
      yield* out(g, { host, pending: rows, applied: true }, () =>
        console.log(`migrations applied to ${host}`),
      );
    }),
).pipe(Command.withDescription("Apply pending Drizzle migrations (additive only, unless told)"));

const seed = Command.make("seed", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    const url = databaseUrl(g.env);
    if (!url) return yield* fail(`no database url for env ${g.env}`);
    const apply = yield* gate(
      g,
      `seed reference data, the Phase 0 lexicon as draft and Unit 1 as draft into ${new URL(url).host}`,
    );
    const seedPath = fileURLToPath(new URL("../../../db/src/seed.ts", import.meta.url));
    const args = apply ? ["--live"] : ["--dry-run"];
    const proc = Bun.spawn(["bun", seedPath, ...args], {
      env: { ...process.env, DATABASE_URL: url },
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = yield* tryPromise(() => proc.exited, "seed");
    if (code !== 0) return yield* fail(`seed exited with ${code}`);
  }),
).pipe(Command.withDescription("Seed reference data, the lexicon (draft) and Unit 1 (draft)"));

const reset = Command.make("reset", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    const url = databaseUrl(g.env);
    if (!url) return yield* fail(`no database url for env ${g.env}`);
    if (g.env === "prod")
      return yield* fail("refusing to reset production; restore from a PlanetScale backup instead");
    const apply = yield* gate(
      g,
      `DROP SCHEMA public CASCADE on ${new URL(url).host}${new URL(url).pathname} and re-apply migrations`,
    );
    if (!apply) return;
    const sql = postgres(forPostgresJs(url), { max: 1, onnotice: () => {} });
    yield* tryPromise(async () => {
      await sql.unsafe(
        "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;",
      );
      await sql.end();
    }, "reset");
    yield* tryPromise(() => runMigrations(url), "migrate");
    console.log("schema dropped and migrations re-applied; run `molo db seed --live` to seed");
  }),
).pipe(Command.withDescription("Drop and re-create the schema (never prod)"));

const query = Command.make(
  "query",
  {
    sql: Args.text({ name: "sql" }).pipe(Args.withDescription("A single SQL statement")),
    limit: Options.integer("limit").pipe(Options.withDefault(100)),
  },
  ({ sql: statement, limit }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const url = databaseUrl(g.env);
      if (!url) return yield* fail(`no database url for env ${g.env}`);
      const readOnly = READ_ONLY_PREFIX.test(statement);
      if (!readOnly) {
        const apply = yield* gate(
          g,
          `execute a WRITE statement on ${new URL(url).host}: ${statement.slice(0, 80)}`,
        );
        if (!apply) return;
      }
      const rows = yield* tryPromise(async () => {
        // Belt and braces: a read-only statement also runs in a READ ONLY transaction.
        if (readOnly) return readOnlyRows(url, statement, limit);
        const sql = postgres(forPostgresJs(url), { max: 1, onnotice: () => {} });
        try {
          const r = await sql.unsafe(statement);
          return Array.from(r as unknown as Iterable<Record<string, unknown>>).slice(0, limit);
        } finally {
          await sql.end();
        }
      }, "query");
      yield* out(g, rows, () => {
        table(rows);
        console.log(`${rows.length} row(s)${rows.length === limit ? ` (limit ${limit})` : ""}`);
      });
    }),
).pipe(Command.withDescription("Run SQL; read-only unless --live; prod needs --env prod --live"));

/** Connections and what they run now; literals in query text are masked. */
const activity = Command.make("activity", {}, () =>
  Effect.gen(function* () {
    const g = yield* molo;
    const url = databaseUrl(g.env);
    if (!url) return yield* fail(`no database url for env ${g.env}`);
    banner(g.env);
    const rows = toActivity(yield* tryPromise(() => readOnlyRows(url, ACTIVITY_SQL), "activity"));
    const byState: Record<string, number> = {};
    for (const r of rows) {
      const k = r.state || r.backend;
      byState[k] = (byState[k] ?? 0) + 1;
    }
    yield* out(g, { host: new URL(url).host, byState, connections: rows }, () => {
      console.log(
        `${rows.length} other connection(s) on ${new URL(url).host}: ${JSON.stringify(byState)}`,
      );
      table(
        rows.map((r) => ({
          pid: r.pid,
          state: r.state || r.backend,
          wait: r.waitEvent,
          "query s": r.querySeconds ?? "",
          "xact s": r.xactSeconds ?? "",
          app: r.application.slice(0, 20),
          query: r.query,
        })),
      );
    });
  }),
).pipe(
  Command.withDescription(
    "pg_stat_activity: connections, state, waits (read-only, literals masked)",
  ),
);

/** Top statements from pg_stat_statements, or a clear note when the extension is absent. */
const slow = Command.make(
  "slow",
  {
    limit: Options.integer("limit").pipe(Options.withDefault(15)),
    order: Options.choice("order", Object.keys(SLOW_ORDER) as SlowOrder[]).pipe(
      Options.withDefault("total" as SlowOrder),
      Options.withDescription("Sort by total time, mean time or calls"),
    ),
  },
  ({ limit, order }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      const url = databaseUrl(g.env);
      if (!url) return yield* fail(`no database url for env ${g.env}`);
      banner(g.env);
      const host = new URL(url).host;
      const [ext] = yield* tryPromise(() => readOnlyRows(url, STATEMENTS_EXTENSION_SQL), "slow");
      const installed = (ext?.["installed"] as string | null) ?? null;
      const available = (ext?.["available"] as string | null) ?? null;
      if (!installed) {
        const note =
          `pg_stat_statements is not installed on ${host}` +
          (available
            ? ` (available, version ${available}; enabling it is a schema change for a person to make)`
            : " and not available on this server");
        yield* out(g, { host, installed: false, available, statements: [] }, () =>
          console.log(note),
        );
        return;
      }
      const rows = toSlow(
        yield* tryPromise(() => readOnlyRows(url, slowSql(order, limit)), "slow"),
      );
      yield* out(g, { host, installed: true, order, statements: rows }, () => {
        console.log(
          `top ${rows.length} statement(s) on ${host} by ${order} (pg_stat_statements ${installed})`,
        );
        table(
          rows.map((r) => ({
            calls: r.calls,
            "total ms": r.totalMs,
            "mean ms": r.meanMs,
            "max ms": r.maxMs,
            rows: r.rows,
            query: r.query,
          })),
        );
      });
    }),
).pipe(Command.withDescription("pg_stat_statements: top queries by time or calls (read-only)"));

export const db = Command.make("db", {}).pipe(
  Command.withDescription("Migrations, seed, reset and ad-hoc queries"),
  Command.withSubcommands([migrate, seed, reset, query, activity, slow]),
);
