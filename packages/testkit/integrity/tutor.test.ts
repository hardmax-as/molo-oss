/**
 * What a tutor supplies, under the sentence that governs the project: no
 * learner ever sees content a human editor has not approved.
 *
 *   - A sentence request is never content. Answering one creates a `draft`
 *     sentence (never anything further along), its English gloss as the
 *     tutor's, and its model-written Norwegian as `ai_draft` unless she
 *     rewrote it.
 *   - A model-written culture card enters at `ai_draft`, is invisible to a
 *     learner, and still needs a second editor to publish.
 *
 * Every string is `zz-` fixture text. Do not weaken these to make a feature pass.
 */

import { schema, tutorRepo } from "@molo/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeLexeme,
  defaultCourse,
  editorA,
  editorB,
  editorRepo,
  harness,
  learner,
  learnerRepo,
  statusOf,
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

/** A published unit, skill and lesson whose one exercise teaches two words. */
async function publishedSkill() {
  const a = editorRepo(h.db, editorA, { morph: yesMorph });
  const b = editorRepo(h.db, editorB, { morph: yesMorph });
  const course = await defaultCourse(h.db);
  const unitSlug = `zz-tutor-unit-${crypto.randomUUID().slice(0, 8)}`;
  const unitId = await a.createUnit({
    courseId: course.id,
    slug: unitSlug,
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await a.createSkill({
    unitId,
    slug: "zz-tutor-skill",
    titleKey: "units.unit1.skills.greetings.title",
    order: 1,
    kind: "vocab",
  });
  const lessonId = await a.createLesson({ skillId, order: 1 });
  const w1 = await completeLexeme(h.db, { lemma: "zz-tutor-one" });
  const w2 = await completeLexeme(h.db, { lemma: "zz-tutor-two" });
  const w3 = await completeLexeme(h.db, { lemma: "zz-tutor-three" });
  const exerciseId = await a.createExercise({
    lessonId,
    order: 1,
    type: "match_pairs",
    payload: { type: "match_pairs", pairs: [{ lexemeId: w1 }, { lexemeId: w2 }, { lexemeId: w3 }] },
  });
  for (const [kind, id] of [
    ["lexeme", w1],
    ["lexeme", w2],
    ["lexeme", w3],
    ["exercise", exerciseId],
    ["lesson", lessonId],
    ["skill", skillId],
    ["unit", unitId],
  ] as const) {
    await a.transitionEntity({ kind, id, to: "in_review" });
    const r = await b.transitionEntity({ kind, id, to: "published" });
    if (!r.ok) throw new Error(`${kind} did not publish: ${r.reason}`);
  }
  return { unitSlug, skillId, lessonId, words: [w1, w2, w3], courseId: course.id };
}

async function request(skillId: string, words: string[]) {
  return tutorRepo(h.db, editorA).createRequest({
    skillId,
    slug: `zz-req-${crypto.randomUUID().slice(0, 8)}`,
    order: 1,
    promptEn: "zz fixture prompt",
    promptNb: "zz fikstur-setning",
    note: "zz fixture context",
    targetLexemeIds: words,
  });
}

async function glossesOf(sentenceId: string) {
  const rows = await h.db
    .select({
      lang: schema.sentenceGlosses.sourceLang,
      gloss: schema.sentenceGlosses.gloss,
      status: schema.sentenceGlosses.status,
    })
    .from(schema.sentenceGlosses)
    .where(eq(schema.sentenceGlosses.sentenceId, sentenceId));
  return Object.fromEntries(rows.map((r) => [r.lang, { gloss: r.gloss, status: r.status }]));
}

describe("sentence requests", () => {
  it("a learner cannot touch them", async () => {
    expect(() => tutorRepo(h.db, learner)).toThrow(/editorial/);
  });

  it("lists a request with the words it names and their glosses", async () => {
    const { skillId, words, unitSlug } = await publishedSkill();
    await request(skillId, [words[0] as string]);
    const [r] = await tutorRepo(h.db, editorA).listRequests({ unitSlug });
    expect(r?.status).toBe("open");
    expect(r?.words.map((w) => w.lemma)).toEqual(["zz-tutor-one"]);
    expect(r?.words[0]?.gloss.en).toMatch(/fixture gloss en/);
  });

  it("answering creates a draft sentence, never more, with provenance and the right glosses", async () => {
    const { skillId, words } = await publishedSkill();
    const id = await request(skillId, words);
    const { sentenceId } = await tutorRepo(h.db, editorA).fulfilRequest(id, {
      textXh: "  zz typed by the tutor  ",
    });
    const [s] = await h.db
      .select()
      .from(schema.sentences)
      .where(eq(schema.sentences.id, sentenceId));
    expect(s?.status).toBe("draft");
    expect(s?.textXh).toBe("zz typed by the tutor");
    expect(s?.source).toBe("tutor");
    expect(s?.sourceRef).toMatch(/^tutor, Fixture Editor A, \d{4}-\d{2}-\d{2}$/);
    expect(s?.grammarTags).toMatchObject({ sentenceRequest: id });

    // English: the tutor wrote the isiXhosa for it, so it is hers.
    // Norwegian: a model's, which she did not touch, so it waits for review.
    expect(await glossesOf(sentenceId)).toEqual({
      en: { gloss: "zz fixture prompt", status: "draft" },
      nb: { gloss: "zz fikstur-setning", status: "ai_draft" },
    });

    const [r] = await h.db
      .select()
      .from(schema.sentenceRequests)
      .where(eq(schema.sentenceRequests.id, id));
    expect(r?.status).toBe("fulfilled");
    expect(r?.fulfilledSentenceId).toBe(sentenceId);
    expect(r?.fulfilledBy).toBe(editorA.id);

    // Not a learner's, at any point.
    expect(await learnerRepo(h.db).getSentences([sentenceId], "en")).toEqual([]);
  });

  it("the tutor's edits to the translation become the glosses, and are hers", async () => {
    const { skillId, words } = await publishedSkill();
    const id = await request(skillId, words);
    const { sentenceId } = await tutorRepo(h.db, editorA).fulfilRequest(id, {
      textXh: "zz typed",
      promptEn: "zz what it really says",
      promptNb: "zz hva den egentlig sier",
    });
    expect(await glossesOf(sentenceId)).toEqual({
      en: { gloss: "zz what it really says", status: "draft" },
      nb: { gloss: "zz hva den egentlig sier", status: "draft" },
    });
  });

  it("a request is answered once; a second answer is refused and writes nothing", async () => {
    const { skillId, words } = await publishedSkill();
    const id = await request(skillId, words);
    const repo = tutorRepo(h.db, editorA);
    await repo.fulfilRequest(id, { textXh: "zz first" });
    await expect(repo.fulfilRequest(id, { textXh: "zz second" })).rejects.toThrow(/fulfilled/);
    const rows = await h.db
      .select()
      .from(schema.sentences)
      .where(eq(schema.sentences.textXh, "zz second"));
    expect(rows).toEqual([]);
  });

  it("a failed answer leaves no half-made sentence behind", async () => {
    const { skillId, words } = await publishedSkill();
    const first = await request(skillId, words);
    const second = await request(skillId, words);
    const repo = tutorRepo(h.db, editorA);
    await repo.fulfilRequest(first, { textXh: "zz same text" });
    // The same text from the same source is one sentence: the second answer
    // conflicts, and the request stays open rather than pointing at nothing.
    await expect(repo.fulfilRequest(second, { textXh: "zz same text" })).rejects.toThrow();
    const [r] = await h.db
      .select({ status: schema.sentenceRequests.status })
      .from(schema.sentenceRequests)
      .where(eq(schema.sentenceRequests.id, second));
    expect(r?.status).toBe("open");
  });

  it("can be set aside with a reason and put back", async () => {
    const { skillId, words } = await publishedSkill();
    const id = await request(skillId, words);
    const repo = tutorRepo(h.db, editorA);
    await repo.dismissRequest(id, "zz does not work");
    await expect(repo.fulfilRequest(id, { textXh: "zz nope" })).rejects.toThrow(/dismissed/);
    await repo.reopenRequest(id);
    const [r] = await repo.listRequests();
    expect(r?.status).toBe("open");
    expect(r?.dismissedReason).toBeNull();
  });

  it("a published answer becomes a draft translate_tap in its skill, once", async () => {
    const { skillId, words } = await publishedSkill();
    const id = await request(skillId, words);
    const repo = tutorRepo(h.db, editorA);
    const { sentenceId } = await repo.fulfilRequest(id, { textXh: "zz one" });

    // Still a draft: not a candidate for an exercise yet.
    expect((await repo.tapCandidates())[0]?.sentenceStatus).toBe("draft");

    await editorRepo(h.db, editorA, { morph: yesMorph }).setSentenceTokens(sentenceId, [
      {
        position: 0,
        lexemeId: words[0] as string,
        surfaceForm: "zz-tutor-one",
        morphVerified: true,
      },
    ]);
    // Standing in for the full review, which the sentence-gate suite covers.
    await h.db
      .update(schema.sentences)
      .set({ status: "published" })
      .where(eq(schema.sentences.id, sentenceId));

    const [c] = await repo.tapCandidates();
    expect(c).toMatchObject({ sentenceStatus: "published", existingExerciseId: null });
    expect(c?.tokenLexemeIds).toEqual([words[0]]);
    const exerciseId = await repo.addTranslateTap({
      skillId,
      sentenceId,
      distractorLexemeIds: [words[1] as string, words[2] as string],
      note: "zz fixture",
    });
    expect(await statusOf(h.db, "exercises", exerciseId)).toBe("draft");
    const [ex] = await h.db
      .select()
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId));
    expect(ex?.type).toBe("translate_tap");
    expect(ex?.sentenceIds).toEqual([sentenceId]);
    expect((await repo.tapCandidates())[0]?.existingExerciseId).toBe(exerciseId);
  });
});

describe("culture cards", () => {
  const payload = (lexemeId: string) => ({
    type: "culture_card" as const,
    title: { en: "zz card", nb: "zz kort" },
    body: { en: "zz body", nb: "zz tekst" },
    lexemeIds: [lexemeId],
  });

  it("a loaded card is ai_draft, carries its caveat, and a learner never sees it", async () => {
    const { skillId, words, unitSlug, courseId } = await publishedSkill();
    const repo = tutorRepo(h.db, editorA);
    const id = await repo.addCultureCard({
      skillId,
      slug: "zz-card",
      payload: payload(words[0] as string),
      caveat: "1. zz claim to confirm",
    });
    expect(await statusOf(h.db, "exercises", id)).toBe("ai_draft");

    const [view] = await repo.cultureCards(courseId);
    expect(view?.caveat).toContain("zz claim to confirm");
    expect(view?.words.map((w) => w.lemma)).toEqual(["zz-tutor-one"]);
    expect(await repo.findCultureCard(skillId, "zz-card", "anything")).toEqual({ id });
    expect(await repo.findCultureCard(skillId, "zz-other", "zz card")).toEqual({ id });

    // In a lesson of its own, which is a draft too; neither reaches a learner.
    const unit = await learnerRepo(h.db).getUnitBySlug(unitSlug, courseId);
    const served = unit?.skills.flatMap((s) => s.lessons.flatMap((l) => l.exercises)) ?? [];
    expect(served.map((e) => e.id)).not.toContain(id);
    const [row] = await h.db
      .select({ lessonId: schema.exercises.lessonId })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, id));
    const [lesson] = await h.db
      .select({ status: schema.lessons.status })
      .from(schema.lessons)
      .where(and(eq(schema.lessons.id, row?.lessonId as string)));
    expect(lesson?.status).toBe("draft");
  });

  it("the editor who loaded a card cannot also publish it", async () => {
    const { skillId, words } = await publishedSkill();
    const id = await tutorRepo(h.db, editorA).addCultureCard({
      skillId,
      slug: "zz-card",
      payload: payload(words[0] as string),
      caveat: "1. zz claim",
    });
    const a = editorRepo(h.db, editorA, { morph: yesMorph });
    expect(await a.transitionEntity({ kind: "exercise", id, to: "published" })).toMatchObject({
      ok: false,
    });
    await a.transitionEntity({ kind: "exercise", id, to: "in_review" });
    expect(await a.transitionEntity({ kind: "exercise", id, to: "published" })).toMatchObject({
      ok: false,
    });
    expect(await statusOf(h.db, "exercises", id)).toBe("in_review");
  });
});
