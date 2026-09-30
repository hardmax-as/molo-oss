/**
 * The dev seed must be safe to run twice (docs/NEXT.md item 10): re-seeding
 * used to insert Unit 1's sentences again, so a developer's database grew a
 * copy of every sentence on every run. Every insert now names the natural
 * key its table has a unique index on, so a second run creates nothing.
 *
 * Runs the real `seedUnit1` against Docker Postgres with the real spike
 * file. The lexicon is not seeded here (that is `loadLexicon`'s own test
 * ground), so exercises whose lemmas cannot be resolved are skipped — the
 * sentences, units, skills and lessons, which is where the bug lived, are
 * created either way.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { schema } from "@molo/db";
import { seedUnit1, type SpikeUnit } from "@molo/db/seed";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { defaultCourse, harness, type Harness } from "./helpers.ts";

const SPIKE = fileURLToPath(new URL("../../../spike/unit1.exercises.json", import.meta.url));
// The spike file is not part of the open-source snapshot; without it there is nothing to seed.
const hasSpike = existsSync(SPIKE);
const spike = (hasSpike ? JSON.parse(readFileSync(SPIKE, "utf8")) : null) as SpikeUnit;

let h: Harness;

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});

afterAll(async () => {
  await h?.close();
});

const TABLES = [
  "units",
  "skills",
  "lessons",
  "exercises",
  "sentences",
  "sentence_glosses",
] as const;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = (await h.db.execute(
      sql.raw(`select count(*)::int as n from ${t}`),
    )) as unknown as { n: number }[];
    out[t] = Number(rows[0]?.n ?? 0);
  }
  return out;
}

describe.skipIf(!hasSpike)("dev seed idempotency", () => {
  it("creates nothing the second time it runs", async () => {
    const first = await seedUnit1(h.db, spike, new Map());
    const afterFirst = await counts();
    expect(afterFirst["sentences"]).toBeGreaterThan(0);
    expect(first.created.sentences).toBe(afterFirst["sentences"]);

    const second = await seedUnit1(h.db, spike, new Map());
    expect(second.unitId).toBe(first.unitId);
    expect(second.created).toEqual({ skills: 0, lessons: 0, exercises: 0, sentences: 0 });
    expect(await counts()).toEqual(afterFirst);
  });

  it("finishes a run that was interrupted, instead of skipping the unit", async () => {
    // Only the unit row exists: the state a crash halfway through leaves behind.
    await h.db.insert(schema.units).values({
      courseId: (await defaultCourse(h.db)).id,
      slug: spike.unit.slug,
      titleKey: spike.unit.title_key,
      order: spike.unit.order,
      cefrBand: spike.unit.cefr_band,
      status: "draft",
    });
    const summary = await seedUnit1(h.db, spike, new Map());
    expect(summary.created.skills).toBeGreaterThan(0);
    expect(summary.created.sentences).toBeGreaterThan(0);
  });

  it("writes nothing published", async () => {
    await seedUnit1(h.db, spike, new Map());
    for (const t of ["units", "skills", "lessons", "exercises", "sentences", "sentence_glosses"]) {
      const rows = (await h.db.execute(
        sql.raw(`select count(*)::int as n from ${t} where status = 'published'`),
      )) as unknown as { n: number }[];
      expect({ [t]: Number(rows[0]?.n ?? 0) }).toEqual({ [t]: 0 });
    }
  });

  it("refuses a second sentence with the same text and source", async () => {
    await seedUnit1(h.db, spike, new Map());
    const [existing] = await h.db
      .select({ textXh: schema.sentences.textXh, source: schema.sentences.source })
      .from(schema.sentences)
      .limit(1);
    expect(existing).toBeDefined();
    const failure = await h.db
      .insert(schema.sentences)
      .values({
        textXh: existing?.textXh ?? "",
        source: existing?.source ?? "",
        licence: "CC-BY-SA-4.0",
        status: "draft",
      })
      .then(
        () => null,
        (e: unknown) => e as { cause?: { constraint_name?: string } },
      );
    expect(failure?.cause?.constraint_name).toBe("sentences_text_source_uq");
  });
});
