/**
 * Courses (docs/ARCHITECTURE.md section 2.6). isiXhosa is the only course
 * there is, and this file is what keeps that from being an assumption:
 *
 *  - a learner sees their enrolled course's content and nothing else;
 *  - a second course's units are invisible to a learner enrolled elsewhere,
 *    even when every row in it is `published`;
 *  - a lexeme belongs to a *language*, so two courses over one language
 *    share the lexicon rather than forking it;
 *  - the publish gate asks which generator a course's language uses, and a
 *    language with none has no morphology-dependent publishing.
 *
 * Nothing here is isiXhosa or isiZulu: the second course teaches `zz`, a
 * language code that cannot be mistaken for a real one.
 */

import { coursesRepo, schema } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SPEAKER_ID, FIXTURE_USERS } from "../src/fixtures.ts";
import {
  LICENCE,
  SOURCE,
  defaultCourse,
  editorA,
  editorB,
  editorRepo,
  harness,
  learnerRepo,
  yesMorph,
  type Harness,
} from "./helpers.ts";

let h: Harness;
beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => {
  await h?.close();
});

/** A published unit with one published lesson, in whichever course is named. */
async function publishedUnit(courseId: string, slug: string): Promise<string> {
  const repo = editorRepo(h.db, editorA, { morph: yesMorph });
  const unitId = await repo.createUnit({
    courseId,
    slug,
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await repo.createSkill({
    unitId,
    slug: `${slug}-skill`,
    titleKey: "units.unit1.title",
    order: 1,
    kind: "vocab",
  });
  const lessonId = await repo.createLesson({ skillId, order: 1 });
  // Straight into `published` for the rows this file is not testing the gate
  // on: the gate has its own suite, and forcing status here is the sabotage
  // the course filter has to survive.
  for (const [table, id] of [
    [schema.lessons, lessonId],
    [schema.skills, skillId],
    [schema.units, unitId],
  ] as const) {
    await h.db.update(table).set({ status: "published" }).where(eq(table.id, id));
  }
  return unitId;
}

/** A second course, teaching a language that has no morphology generator. */
async function secondCourse(): Promise<{ id: string; targetLang: string }> {
  await h.db
    .insert(schema.languages)
    .values({ code: "zz", name: "Fixture language", isSource: false, isTarget: true })
    .onConflictDoNothing();
  const [row] = await h.db
    .insert(schema.courses)
    .values({
      slug: "zz-second-course",
      targetLang: "zz",
      titleKey: "courses.xhosa.title",
      order: 2,
      isDefault: false,
      status: "published",
    })
    .returning({ id: schema.courses.id, targetLang: schema.courses.targetLang });
  if (!row) throw new Error("second course not created");
  return row;
}

describe("a learner only ever sees their enrolled course", () => {
  it("lists the enrolled course's units and never another course's", async () => {
    const home = await defaultCourse(h.db);
    const other = await secondCourse();
    await publishedUnit(home.id, "zz-unit-home");
    await publishedUnit(other.id, "zz-unit-other");

    const learner = learnerRepo(h.db);
    expect((await learner.listUnits(home.id)).map((u) => u.slug)).toEqual(["zz-unit-home"]);
    expect((await learner.listUnits(other.id)).map((u) => u.slug)).toEqual(["zz-unit-other"]);
    // A slug from the other course is not found, not silently served.
    expect(await learner.getUnitBySlug("zz-unit-other", home.id)).toBeNull();
    expect(await learner.getUnitBySlug("zz-unit-home", other.id)).toBeNull();
    expect((await learner.unitContentIndex(home.id)).length).toBe(1);
  });

  it("resolves the enrolment: the default course, the chosen one, and never a draft one", async () => {
    const repo = coursesRepo(h.db);
    const home = await defaultCourse(h.db);
    const other = await secondCourse();
    const uid = FIXTURE_USERS.learner.id;

    // A guest and a learner with no enrolment both get the default course.
    expect((await repo.enrolled(null)).id).toBe(home.id);
    await h.db.insert(schema.userPrefs).values({ userId: uid });
    expect((await repo.enrolled(uid)).id).toBe(home.id);

    await h.db
      .update(schema.userPrefs)
      .set({ courseId: other.id })
      .where(eq(schema.userPrefs.userId, uid));
    expect((await repo.enrolled(uid)).id).toBe(other.id);

    // A course that leaves `published` stops being an enrolment: the learner
    // falls back to the default rather than being stranded on nothing.
    await h.db
      .update(schema.courses)
      .set({ status: "retired" })
      .where(eq(schema.courses.id, other.id));
    expect((await repo.enrolled(uid)).id).toBe(home.id);
    expect((await repo.listPublished()).map((c) => c.id)).toEqual([home.id]);
    await expect(repo.assertEnrollable(other.id)).rejects.toThrow(/not open for enrolment/);
  });
});

describe("a lexeme belongs to a language, not to a course", () => {
  it("keeps one lexicon per language and separates languages by the natural key", async () => {
    await secondCourse();
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    // A noun with a class, so every column of the natural key is non-null
    // and Postgres actually enforces it.
    const shared = {
      pos: "noun",
      nounClassLabel: "13",
      source: SOURCE,
      licence: LICENCE,
      origin: "human",
    } as const;
    // The same string in two languages is two words...
    const xh = await repo.createLexeme({ ...shared, lemma: "zz-homograph" });
    const zz = await repo.createLexeme({ ...shared, lemma: "zz-homograph", targetLang: "zz" });
    expect(xh).not.toBe(zz);
    // ...and the same string in one language is one word.
    await expect(repo.createLexeme({ ...shared, lemma: "zz-homograph" })).rejects.toThrow();

    const [row] = await h.db
      .select({ targetLang: schema.lexemes.targetLang })
      .from(schema.lexemes)
      .where(eq(schema.lexemes.id, xh));
    expect(row?.targetLang).toBe("xh");
  });
});

describe("the publish gate asks which generator the course's language uses", () => {
  /** A noun in `zz` that is complete but for the plural nothing can generate. */
  async function completeNoun(targetLang: string, lemma: string): Promise<string> {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await repo.createLexeme({
      targetLang,
      lemma,
      pos: "noun",
      nounClassLabel: "13",
      source: SOURCE,
      licence: LICENCE,
      origin: "human",
    });
    await repo.upsertGloss(id, { sourceLang: "en", gloss: "fixture en", origin: "human" });
    await repo.upsertGloss(id, { sourceLang: "nb", gloss: "fixture nb", origin: "human" });
    const audioId = await repo.createAudioAsset({
      targetKind: "lexeme",
      targetId: id,
      speakerId: FIXTURE_SPEAKER_ID,
      tier: "1_native_studio",
      r2Key: `audio/${lemma}.opus`,
      sha256: "c".repeat(64),
      durationMs: 700,
      lufs: -16,
      peakDbfs: -1.5,
      codec: "opus",
      sampleRate: 48_000,
      licence: "proprietary-molo",
    });
    const published = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "audio_asset",
      id: audioId,
      to: "published",
    });
    if (!published.ok) throw new Error(`fixture audio: ${published.reason}`);
    await repo.transitionEntity({ kind: "lexeme", id, to: "in_review" });
    return id;
  }

  /** The real mapping: isiXhosa has xh-morph, nothing else has anything. */
  const realMorph = {
    generatorFor: (lang: string) => (lang === "xh" ? "xh-morph" : null),
    canGeneratePlural: (lang: string) => Promise.resolve(lang === "xh"),
  };

  it("refuses a noun in a language with no generator, and takes an editor's plural link instead", async () => {
    await secondCourse();
    const id = await completeNoun("zz", "zz-nogen");
    const approver = editorRepo(h.db, editorB, { morph: realMorph });

    const blocked = await approver.transitionEntity({ kind: "lexeme", id, to: "published" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.gate?.failures.map((f) => f.code)).toContain("no_morphology_generator");
      // Not "the generator said no" — there is no generator to ask.
      expect(blocked.gate?.failures.map((f) => f.code)).not.toContain("plural_not_generable");
    }

    // An editor stating the plural is the only path: a human, not a guess.
    const plural = await editorRepo(h.db, editorA, { morph: realMorph }).createLexeme({
      targetLang: "zz",
      lemma: "zz-nogen-plural",
      pos: "noun",
      nounClassLabel: "12",
      isPlural: true,
      source: SOURCE,
      licence: LICENCE,
      origin: "human",
    });
    await editorRepo(h.db, editorA, { morph: realMorph }).addLink(plural, id, "plural_of");
    const ok = await approver.transitionEntity({ kind: "lexeme", id, to: "published" });
    expect(ok).toEqual({ ok: true, status: "published" });
  });

  it("still publishes an isiXhosa noun through xh-morph, unchanged", async () => {
    const id = await completeNoun("xh", "zz-withgen");
    const r = await editorRepo(h.db, editorB, { morph: realMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    expect(r).toEqual({ ok: true, status: "published" });
  });
});
