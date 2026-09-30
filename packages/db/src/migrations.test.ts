import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The migration folder is a chain, not a bag: `drizzle-kit generate` diffs the
 * schema against the newest snapshot, so one missing or mis-parented snapshot
 * makes it re-emit tables that already exist. Three agents generating
 * migrations in parallel is exactly how that happened, so it is asserted here
 * rather than remembered.
 */

const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
const drizzleDir = join(pkgRoot, "drizzle");
const metaDir = join(drizzleDir, "meta");

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

interface JournalEntry {
  readonly idx: number;
  readonly tag: string;
  readonly version: string;
}

interface Snapshot {
  readonly id: string;
  readonly prevId: string;
  readonly version: string;
  readonly dialect: string;
}

const journal = JSON.parse(readFileSync(join(metaDir, "_journal.json"), "utf8")) as {
  readonly entries: readonly JournalEntry[];
};

const snapshotName = (idx: number): string => `${String(idx).padStart(4, "0")}_snapshot.json`;

const readSnapshot = (idx: number): Snapshot =>
  JSON.parse(readFileSync(join(metaDir, snapshotName(idx)), "utf8")) as Snapshot;

describe("the drizzle migration chain", () => {
  it("numbers its journal entries from zero without a gap", () => {
    expect(journal.entries.map((e) => e.idx)).toEqual(journal.entries.map((_, i) => i));
  });

  it("has the SQL file every journal entry names", () => {
    for (const entry of journal.entries) {
      expect(existsSync(join(drizzleDir, `${entry.tag}.sql`)), `${entry.tag}.sql`).toBe(true);
    }
  });

  it("has one snapshot per journal entry and no orphans", () => {
    const expected = journal.entries.map((e) => snapshotName(e.idx)).sort();
    const actual = readdirSync(metaDir)
      .filter((f) => f.endsWith("_snapshot.json"))
      .sort();
    expect(actual).toEqual(expected);
  });

  it("links every snapshot to its predecessor", () => {
    let prev = ZERO_UUID;
    const seen = new Set<string>();
    for (const entry of journal.entries) {
      const snapshot = readSnapshot(entry.idx);
      expect(snapshot.prevId, `${snapshotName(entry.idx)} prevId`).toBe(prev);
      expect(seen.has(snapshot.id), `${snapshotName(entry.idx)} id is reused`).toBe(false);
      expect(snapshot.dialect).toBe("postgresql");
      expect(snapshot.version).toBe(entry.version);
      seen.add(snapshot.id);
      prev = snapshot.id;
    }
  });

  /**
   * The one assertion that cannot be faked: run the real generator against a
   * throwaway copy of the folder and require it to find nothing to do. If the
   * newest snapshot has drifted from `src/schema`, this is where it shows.
   */
  it("leaves drizzle-kit generate with nothing to emit", () => {
    const tmp = mkdtempSync(join(tmpdir(), "molo-drizzle-chain-"));
    try {
      const out = join(tmp, "drizzle");
      cpSync(drizzleDir, out, { recursive: true });
      const config = join(tmp, "drizzle.config.ts");
      writeFileSync(
        config,
        // A bare object rather than `defineConfig`, so the throwaway config
        // does not have to resolve `drizzle-kit` from a temp directory.
        `export default {\n` +
          `  dialect: "postgresql",\n` +
          `  schema: ${JSON.stringify(join(pkgRoot, "src/schema/index.ts"))},\n` +
          `  out: ${JSON.stringify(out)},\n` +
          `  casing: "snake_case",\n` +
          `};\n`,
        "utf8",
      );

      const result = spawnSync(
        join(pkgRoot, "node_modules/.bin/drizzle-kit"),
        ["generate", "--config", config],
        { cwd: pkgRoot, encoding: "utf8" },
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);

      // Nothing to emit means nothing new on disk: no SQL file, no snapshot,
      // and a journal that still ends where it did.
      const emitted = readdirSync(out).filter((f) => f.endsWith(".sql"));
      expect(emitted.sort()).toEqual(journal.entries.map((e) => `${e.tag}.sql`).sort());
      expect(readdirSync(join(out, "meta")).sort()).toEqual(readdirSync(metaDir).sort());
      expect(readFileSync(join(out, "meta/_journal.json"), "utf8")).toBe(
        readFileSync(join(metaDir, "_journal.json"), "utf8"),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 60_000);
});
