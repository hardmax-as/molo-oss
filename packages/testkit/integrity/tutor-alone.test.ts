/**
 * What a tutor working alone, remotely, depends on (docs/EDITOR-GUIDE.md):
 *
 *   - The golden-forms sheet saves to the server, editors only, and the
 *     operator reads it back for `molo morph goldens pull`. It is not content
 *     and reaches no learner.
 *   - A culture card's words are lexicon rows only, and every edit and move
 *     leaves a revision the page can name ("last edited by").
 *   - Culture cards, sentences she writes and her recordings all arrive in the
 *     review queue with who made them, and she cannot approve her own.
 *   - Replacing a take sends the old one back through the status machine.
 *
 * Every string is `zz-` fixture text. Do not weaken these to make a feature pass.
 */

import { goldenKey } from "@molo/core";
import { goldenAnswersForExport, goldenAnswersRepo, schema, tutorRepo } from "@molo/db";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SPEAKER_ID } from "../src/fixtures.ts";
import {
  completeLexeme,
  defaultCourse,
  editorA,
  editorB,
  editorRepo,
  harness,
  learner,
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

const caseId = goldenKey({ lemma: "zz-golden", class: "1", form: "plural" });
const answer = {
  caseId,
  form: "zz-tutor-form",
  irregular: false,
  notes: "zz note",
  tutorName: "Test tutor",
  validatedOn: "2026-09-26",
};

describe("golden answers", () => {
  it("a learner can neither read nor write them", async () => {
    expect(() => goldenAnswersRepo(h.db, learner)).toThrow(/editorial/);
  });

  it("saves one row per case, says who saved it last, and hands the operator the answers", async () => {
    const a = goldenAnswersRepo(h.db, editorA);
    const saved = await a.put(answer);
    expect(saved).toMatchObject({
      ...answer,
      authorId: editorA.id,
      authorName: "Fixture Editor A",
    });

    // The last save wins; there is still one row.
    await goldenAnswersRepo(h.db, editorB).put({ ...answer, form: "", irregular: true });
    const list = await a.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ form: "", irregular: true, authorName: "Fixture Editor B" });

    expect(await goldenAnswersForExport(h.db)).toEqual([{ ...answer, form: "", irregular: true }]);
  });

  it("refuses a key that is not a golden case", async () => {
    await expect(
      goldenAnswersRepo(h.db, editorA).put({ ...answer, caseId: '["zz","99","plural"]' }),
    ).rejects.toThrow(/golden case key/);
  });
});

/** A draft unit, skill and lesson with a model-written culture card on one word. */
async function cardFixture() {
  const a = editorRepo(h.db, editorA, { morph: yesMorph });
  const course = await defaultCourse(h.db);
  const unitId = await a.createUnit({
    courseId: course.id,
    slug: `zz-alone-${crypto.randomUUID().slice(0, 8)}`,
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await a.createSkill({
    unitId,
    slug: "zz-alone-skill",
    titleKey: "units.unit1.skills.greetings.title",
    order: 1,
    kind: "vocab",
  });
  const w1 = await completeLexeme(h.db, { lemma: "zz-alone-one" });
  const w2 = await completeLexeme(h.db, { lemma: "zz-alone-two" });
  const cardId = await tutorRepo(h.db, editorA).addCultureCard({
    skillId,
    slug: "zz-card",
    payload: {
      type: "culture_card",
      title: { en: "zz card", nb: "zz kort" },
      body: { en: "zz body", nb: "zz tekst" },
      lexemeIds: [w1],
    },
    caveat: "1. zz claim",
  });
  return { courseId: course.id, skillId, cardId, words: [w1, w2] as const };
}

describe("culture cards edited by a tutor", () => {
  it("changes its words to lexicon rows only, and names who edited it last", async () => {
    const { courseId, cardId, words } = await cardFixture();
    const tutor = editorRepo(h.db, editorB, { morph: yesMorph });
    const [before] = await tutorRepo(h.db, editorB).cultureCards(courseId);
    expect(before?.lastEdit).toMatchObject({ what: "created", actorName: "Fixture Editor A" });

    const payload = {
      type: "culture_card" as const,
      title: { en: "zz card edited", nb: "zz kort redigert" },
      body: { en: "zz body", nb: "zz tekst" },
      lexemeIds: [words[1]],
    };
    await tutor.updateExercise(cardId, { payload });
    const [after] = await tutorRepo(h.db, editorB).cultureCards(courseId);
    expect(after?.words.map((w) => w.lemma)).toEqual(["zz-alone-two"]);
    expect(after?.lastEdit).toMatchObject({ what: "edit", actorName: "Fixture Editor B" });

    // A word that is not in the lexicon is refused, whatever sent it.
    await expect(
      tutor.updateExercise(cardId, {
        payload: { ...payload, lexemeIds: ["00000000-0000-4000-8000-00000000dead"] },
      }),
    ).rejects.toThrow(/not in the lexicon/);

    await tutor.transitionEntity({ kind: "exercise", id: cardId, to: "in_review" });
    const [moved] = await tutorRepo(h.db, editorB).cultureCards(courseId);
    expect(moved?.lastEdit).toMatchObject({ what: "status", actorName: "Fixture Editor B" });
  });
});

describe("the review queue for a tutor's work", () => {
  it("lists an in-review culture card with its title and creator; the creator cannot approve it", async () => {
    const { cardId } = await cardFixture();
    const a = editorRepo(h.db, editorA, { morph: yesMorph });
    await a.transitionEntity({ kind: "exercise", id: cardId, to: "in_review" });
    const row = (await a.reviewQueue()).find((r) => r.entityId === cardId);
    expect(row).toMatchObject({
      entityKind: "exercise",
      createdBy: editorA.id,
      createdByName: "Fixture Editor A",
      exercise: { type: "culture_card", title: "zz card" },
    });
    expect(
      await a.transitionEntity({ kind: "exercise", id: cardId, to: "published" }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/four-eyes/) });
  });

  it("lists a sentence the tutor wrote once she sends it, and only another editor may approve it", async () => {
    const { skillId, words } = await cardFixture();
    const requestId = await tutorRepo(h.db, editorA).createRequest({
      skillId,
      slug: "zz-req",
      order: 1,
      promptEn: "zz prompt",
      promptNb: "zz setning",
      note: null,
      targetLexemeIds: [words[0]],
    });
    const { sentenceId } = await tutorRepo(h.db, editorB, { morph: yesMorph }).fulfilRequest(
      requestId,
      { textXh: "zz tutor sentence" },
    );
    const tutor = editorRepo(h.db, editorB, { morph: yesMorph });
    expect((await tutor.reviewQueue()).some((r) => r.entityId === sentenceId)).toBe(false);
    await tutor.transitionEntity({ kind: "sentence", id: sentenceId, to: "in_review" });
    const row = (await tutor.reviewQueue()).find((r) => r.entityId === sentenceId);
    expect(row).toMatchObject({
      entityKind: "sentence",
      label: "zz tutor sentence",
      createdByName: "Fixture Editor B",
    });
    expect(
      await tutor.transitionEntity({ kind: "sentence", id: sentenceId, to: "published" }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/four-eyes/) });
    const [sentence] = await h.db
      .select({ status: schema.sentences.status })
      .from(schema.sentences)
      .where(eq(schema.sentences.id, sentenceId));
    expect(sentence?.status).toBe("in_review");
  });

  it("lists a recording with the word and the speaker; replacing it sends the old take back with a note", async () => {
    const lexemeId = await completeLexeme(h.db, { lemma: "zz-alone-take" });
    const tutor = editorRepo(h.db, editorB, { morph: yesMorph });
    const take = await tutor.createAudioAsset({
      targetKind: "lexeme",
      targetId: lexemeId,
      speakerId: FIXTURE_SPEAKER_ID,
      tier: "1_native_studio",
      r2Key: `audio/${"b".repeat(64)}.opus`,
      sha256: "b".repeat(64),
      durationMs: 700,
      lufs: -16,
      peakDbfs: -2,
      codec: "opus",
      sampleRate: 48_000,
      licence: "proprietary-molo",
    });
    const row = (await tutor.reviewQueue()).find((r) => r.entityId === take);
    expect(row).toMatchObject({
      entityKind: "audio_asset",
      createdByName: "Fixture Editor B",
      audio: {
        targetKind: "lexeme",
        targetId: lexemeId,
        targetText: "zz-alone-take",
        speakerName: "Fixture Speaker",
        tier: "1_native_studio",
      },
    });
    // Her own take: she cannot approve it.
    expect(
      await tutor.transitionEntity({ kind: "audio_asset", id: take, to: "published" }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/four-eyes/) });

    // Replaced from the studio: back to draft, with the reason in the history.
    const replaced = await tutor.transitionEntity({
      kind: "audio_asset",
      id: take,
      to: "draft",
      note: "Replaced by a new take in the studio.",
    });
    expect(replaced).toMatchObject({ ok: true, status: "draft" });
    expect(await statusOf(h.db, "audioAssets", take)).toBe("draft");
    expect((await tutor.reviewQueue()).some((r) => r.entityId === take)).toBe(false);
    const [rev] = await h.db
      .select({ note: schema.contentRevisions.note, actor: schema.contentRevisions.actorId })
      .from(schema.contentRevisions)
      .where(
        and(
          eq(schema.contentRevisions.entityKind, "audio_asset"),
          eq(schema.contentRevisions.entityId, take),
        ),
      )
      .orderBy(desc(schema.contentRevisions.createdAt))
      .limit(1);
    expect(rev).toEqual({ note: "Replaced by a new take in the studio.", actor: editorB.id });
  });
});
