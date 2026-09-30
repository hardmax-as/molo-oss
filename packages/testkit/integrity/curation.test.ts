/**
 * `molo content curate`'s writer, against a real database.
 *
 * Three things have to hold, and none of them can be checked without one:
 * everything it writes is `draft`, a second run changes nothing, and a row
 * an editor has already touched is left exactly as they left it.
 */

import { applyCuration, applyFrequencyRanks, curationLexicon, schema } from "@molo/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { defaultCourse, editorA, editorRepo, harness, yesMorph, type Harness } from "./helpers.ts";

let h: Harness;
beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => {
  await h?.close();
});

const SOURCE = "spraakbanken.gu.se";
const LICENCE = "CC-BY-4.0";

/** Two draft lexemes with English glosses, which is what curation works on. */
async function lexicon(): Promise<{ a: string; b: string }> {
  const repo = editorRepo(h.db, editorA, { morph: yesMorph });
  const a = await repo.createLexeme({
    lemma: "zz-umntwana",
    pos: "noun",
    nounClassLabel: "13",
    source: "isixhosa.click",
    licence: "CC-BY-SA-4.0",
    origin: "human",
  });
  const b = await repo.createLexeme({
    lemma: "zz-inyama",
    pos: "noun",
    nounClassLabel: "12",
    source: "isixhosa.click",
    licence: "CC-BY-SA-4.0",
    origin: "human",
  });
  await repo.upsertGloss(a, { sourceLang: "en", gloss: "child", origin: "human" });
  await repo.upsertGloss(b, { sourceLang: "en", gloss: "meat", origin: "human" });
  return { a, b };
}

function planFor(ids: { a: string; b: string }, courseId: string) {
  return {
    courseId,
    sentences: [
      {
        key: "s1",
        textXh: "Zz-umntwana zz-inyama.",
        translationEn: "The child, the meat.",
        source: SOURCE,
        sourceRef: "xhosa.xml:text=R1;sentence=s1",
        licence: LICENCE,
        cefrBand: "A1" as const,
        grammarTags: { corpus: "spoken-isixhosa-gu" },
        tokens: [
          { position: 0, lexemeId: ids.a, surfaceForm: "Zz-umntwana", morphVerified: false },
          { position: 1, lexemeId: ids.b, surfaceForm: "zz-inyama", morphVerified: false },
        ],
      },
    ],
    units: [
      {
        slug: "zz-curated",
        order: 1,
        cefrBand: "A1" as const,
        titleKey: "curriculum.units.people.title",
        prerequisiteSlug: null,
        skills: [
          {
            slug: "zz-words",
            order: 1,
            kind: "vocab" as const,
            titleKey: "curriculum.units.people.skills.name-your-family.title",
            lexemeIds: [ids.a, ids.b],
            lessons: [
              {
                order: 1,
                estimatedMinutes: 5,
                exercises: [
                  {
                    type: "match_pairs" as const,
                    note: "curated",
                    payload: {
                      type: "match_pairs",
                      pairs: [{ lexemeId: ids.a }, { lexemeId: ids.b }],
                    },
                  },
                  {
                    type: "translate_type" as const,
                    note: "curated",
                    payload: { type: "translate_type", sentenceId: "@sentence:s1" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("applyCuration", () => {
  it("writes everything as draft and nothing as published", async () => {
    const course = await defaultCourse(h.db);
    const ids = await lexicon();
    const result = await applyCuration(h.db, editorA, planFor(ids, course.id));
    expect(result.refused).toEqual([]);
    expect(result.created).toMatchObject({
      units: 1,
      skills: 1,
      lessons: 1,
      exercises: 2,
      sentences: 1,
    });

    for (const table of [schema.units, schema.skills, schema.lessons, schema.exercises] as const) {
      const rows = await h.db.select({ status: table.status }).from(table);
      expect(rows.every((r) => r.status === "draft")).toBe(true);
    }
    const [sentence] = await h.db
      .select({ status: schema.sentences.status, licence: schema.sentences.licence })
      .from(schema.sentences)
      .where(eq(schema.sentences.source, SOURCE));
    expect(sentence?.status).toBe("draft");
    expect(sentence?.licence).toBe(LICENCE);
  });

  it("resolves the sentence placeholder to the row it wrote", async () => {
    const course = await defaultCourse(h.db);
    const ids = await lexicon();
    await applyCuration(h.db, editorA, planFor(ids, course.id));
    const [row] = await h.db
      .select({ payload: schema.exercises.payload, sentenceIds: schema.exercises.sentenceIds })
      .from(schema.exercises)
      .where(eq(schema.exercises.type, "translate_type"));
    const sentenceId = (row?.payload as { sentenceId?: string } | undefined)?.sentenceId;
    expect(sentenceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(row?.sentenceIds).toEqual([sentenceId]);
  });

  it("leaves the tokens unverified, so the sentence cannot pass its gate", async () => {
    const course = await defaultCourse(h.db);
    const ids = await lexicon();
    await applyCuration(h.db, editorA, planFor(ids, course.id));
    const tokens = await h.db
      .select({ morphVerified: schema.sentenceLexemes.morphVerified })
      .from(schema.sentenceLexemes);
    expect(tokens).toHaveLength(2);
    expect(tokens.every((t) => !t.morphVerified)).toBe(true);
  });

  it("changes nothing on a second run", async () => {
    const course = await defaultCourse(h.db);
    const ids = await lexicon();
    await applyCuration(h.db, editorA, planFor(ids, course.id));
    const again = await applyCuration(h.db, editorA, planFor(ids, course.id));
    expect(again.created).toEqual({
      units: 0,
      skills: 0,
      lessons: 0,
      exercises: 0,
      sentences: 0,
      sentenceGlosses: 0,
    });
    expect(again.reused).toEqual({ units: 1, skills: 1, lessons: 1, exercises: 2, sentences: 1 });
    expect(again.bandsSet).toBe(0);
    expect(again.prerequisitesSet).toBe(0);
  });

  it("does not overwrite an editor's edit", async () => {
    const course = await defaultCourse(h.db);
    const ids = await lexicon();
    await applyCuration(h.db, editorA, planFor(ids, course.id));
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const [unit] = await h.db
      .select({ id: schema.units.id })
      .from(schema.units)
      .where(eq(schema.units.slug, "zz-curated"));
    await repo.updateUnit(unit?.id ?? "", { cefrBand: "A2" });
    await applyCuration(h.db, editorA, planFor(ids, course.id));
    const [after] = await h.db
      .select({ cefrBand: schema.units.cefrBand })
      .from(schema.units)
      .where(eq(schema.units.slug, "zz-curated"));
    expect(after?.cefrBand).toBe("A2");
  });

  it("fills a lexeme's CEFR band only while it is empty", async () => {
    const course = await defaultCourse(h.db);
    const ids = await lexicon();
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    await repo.updateLexeme(ids.b, { cefrBand: "B1" });
    const result = await applyCuration(h.db, editorA, planFor(ids, course.id));
    expect(result.bandsSet).toBe(1);
    const rows = await h.db
      .select({ id: schema.lexemes.id, cefrBand: schema.lexemes.cefrBand })
      .from(schema.lexemes);
    expect(rows.find((r) => r.id === ids.a)?.cefrBand).toBe("A1");
    expect(rows.find((r) => r.id === ids.b)?.cefrBand).toBe("B1");
  });
});

describe("applyFrequencyRanks", () => {
  it("writes, then does nothing, then clears what falls out of the blend", async () => {
    const ids = await lexicon();
    const first = await applyFrequencyRanks(h.db, editorA, [
      { lexemeId: ids.a, rank: 1 },
      { lexemeId: ids.b, rank: 2 },
    ]);
    expect(first).toEqual({ updated: 2, unchanged: 0, cleared: 0 });

    const second = await applyFrequencyRanks(h.db, editorA, [
      { lexemeId: ids.a, rank: 1 },
      { lexemeId: ids.b, rank: 2 },
    ]);
    expect(second).toEqual({ updated: 0, unchanged: 2, cleared: 0 });

    const third = await applyFrequencyRanks(h.db, editorA, [{ lexemeId: ids.a, rank: 1 }]);
    expect(third).toEqual({ updated: 0, unchanged: 1, cleared: 1 });
    const [b] = await h.db
      .select({ rank: schema.lexemes.frequencyRank })
      .from(schema.lexemes)
      .where(eq(schema.lexemes.id, ids.b));
    expect(b?.rank).toBeNull();
  });
});

describe("curationLexicon", () => {
  it("returns draft lexemes with their English glosses and class labels", async () => {
    const ids = await lexicon();
    const rows = await curationLexicon(h.db);
    const child = rows.find((r) => r.id === ids.a);
    expect(child?.lemma).toBe("zz-umntwana");
    expect(child?.nounClassLabel).toBe("13");
    expect(child?.glosses).toEqual(["child"]);
  });

  it("does not leak another language's lexicon", async () => {
    await lexicon();
    const rows = await curationLexicon(h.db, "nb");
    expect(rows).toEqual([]);
  });
});

describe("the status gate still holds", () => {
  it("has no path from a curated row to published", async () => {
    const course = await defaultCourse(h.db);
    const ids = await lexicon();
    await applyCuration(h.db, editorA, planFor(ids, course.id));
    const [ex] = await h.db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(and(eq(schema.exercises.type, "match_pairs"), eq(schema.exercises.status, "draft")));
    const outcome = await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "exercise",
      id: ex?.id ?? "",
      to: "published",
    });
    expect(outcome.ok).toBe(false);
  });
});
