import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit generate` diffs src/schema against the last snapshot and
 * writes SQL into ./drizzle. `bun run migrate` (src/migrate.ts) applies it.
 * The database URL is only needed for `push`/`studio`, never for generate.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://molo:molo@localhost:55432/molo",
  },
});
