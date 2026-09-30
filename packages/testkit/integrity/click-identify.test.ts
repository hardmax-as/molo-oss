/**
 * `click_identify`: the learner hears a bare click and picks its letter.
 * Its only content is the studio recording of each click, so its gate is
 * about those recordings: the exercise publishes only when every click it
 * lists has a *published tier-1* take. A take in review, a draft, a retired
 * take or any other tier leaves the click unrecorded as far as a learner is
 * concerned, and the learner read serves published tier-1 takes and nothing
 * else.
 *
 * Also here: the draft-only moves `molo content reconcile-unit-1` makes
 * (docs/curriculum-audit.md section 1). Moving content a reviewer has seen
 * would change it under them, so only drafts move.
 */

import { CLICK_SOUNDS, clickIdsForSet, type ExercisePayload } from "@molo/core";
import { schema } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SPEAKER_ID } from "../src/fixtures.ts";
import {
  editorA,
  editorB,
  editorRepo,
  harness,
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

const byLetter = (letter: string) => CLICK_SOUNDS.find((c) => c.letter === letter)!;
const setA: ExercisePayload = { type: "click_identify", set: "A", clicks: clickIdsForSet("A") };

function clickTake(targetId: string, n: number) {
  const sha = String(n).repeat(64).slice(0, 64);
  return {
    targetKind: "click" as const,
    targetId,
    speakerId: FIXTURE_SPEAKER_ID,
    tier: "1_native_studio" as const,
    r2Key: `audio/${sha}.opus`,
    sha256: sha,
    durationMs: 600,
    lufs: -16,
    peakDbfs: -1.5,
    codec: "opus",
    sampleRate: 48_000,
    licence: "proprietary-molo",
  };
}

async function lesson(slug: string) {
  const repo = editorRepo(h.db, editorA, { morph: yesMorph });
  const unitId = await repo.createUnit({
    slug,
    titleKey: "units.zz.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await repo.createSkill({
    unitId,
    slug: `${slug}-s`,
    titleKey: "skills.zz.title",
    order: 1,
    kind: "pronunciation",
  });
  return { unitId, skillId, lessonId: await repo.createLesson({ skillId, order: 1 }) };
}

async function publishTake(letter: string, n: number): Promise<string> {
  const id = await editorRepo(h.db, editorA, { morph: yesMorph }).createAudioAsset(
    clickTake(byLetter(letter).id, n),
  );
  const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
    kind: "audio_asset",
    id,
    to: "published",
  });
  expect(r.ok).toBe(true);
  return id;
}

describe("click_identify publish gate", () => {
  it("refuses while any click lacks a published tier-1 take, naming each", async () => {
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    const { lessonId } = await lesson("zz-ci-u1");
    const id = await author.createExercise({
      lessonId,
      order: 1,
      type: "click_identify",
      payload: setA,
    });
    await author.transitionEntity({ kind: "exercise", id, to: "in_review" });

    await publishTake("c", 1);
    // x: a take still in review. q: a published take, retired again.
    await author.createAudioAsset(clickTake(byLetter("x").id, 2));
    const q = await publishTake("q", 3);
    await h.db
      .update(schema.audioAssets)
      .set({ status: "retired" })
      .where(eq(schema.audioAssets.id, q));

    const approver = editorRepo(h.db, editorB, { morph: yesMorph });
    const gate = await approver.publishCheck("exercise", id);
    expect(gate.failures).toEqual([
      { code: "click_audio_missing", detail: "x" },
      { code: "click_audio_missing", detail: "q" },
    ]);
    const refused = await approver.transitionEntity({ kind: "exercise", id, to: "published" });
    expect(refused.ok).toBe(false);
    expect(await statusOf(h.db, "exercises", id)).toBe("in_review");
  });

  it("does not count a published take forced to tier 3", async () => {
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    const { lessonId } = await lesson("zz-ci-u2");
    const id = await author.createExercise({
      lessonId,
      order: 1,
      type: "click_identify",
      payload: setA,
    });
    await publishTake("c", 1);
    await publishTake("x", 2);
    const q = await publishTake("q", 3);
    await h.db
      .update(schema.audioAssets)
      .set({ tier: "3_tts" })
      .where(eq(schema.audioAssets.id, q));
    const gate = await editorRepo(h.db, editorB, { morph: yesMorph }).publishCheck("exercise", id);
    expect(gate.failures).toEqual([{ code: "click_audio_missing", detail: "q" }]);
  });

  it("publishes once every click has a published studio take", async () => {
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    const { lessonId } = await lesson("zz-ci-u3");
    const id = await author.createExercise({
      lessonId,
      order: 1,
      type: "click_identify",
      payload: setA,
    });
    await author.transitionEntity({ kind: "exercise", id, to: "in_review" });
    for (const [n, letter] of ["c", "x", "q"].entries()) await publishTake(letter, n + 1);
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "exercise",
      id,
      to: "published",
    });
    expect(r).toMatchObject({ ok: true, status: "published" });
  });
});

describe("the learner read serves only published tier-1 takes of the clicks asked for", () => {
  it("filters to the exercise's clicks and skips drafts and reviews", async () => {
    await publishTake("c", 1);
    await publishTake("ch", 2);
    await editorRepo(h.db, editorA, { morph: yesMorph }).createAudioAsset(
      clickTake(byLetter("x").id, 3),
    );
    const heard = await learnerRepo(h.db).publishedClickAudio(clickIdsForSet("A"));
    expect(heard.map((r) => r.clickId)).toEqual([byLetter("c").id]);
    expect(await learnerRepo(h.db).publishedClickAudio([])).toEqual([]);
  });
});

describe("reconcile moves only drafts", () => {
  it("moves a draft exercise and grammar note, and refuses one in review", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const from = await lesson("zz-rc-old");
    const to = await lesson("zz-rc-new");
    const draft = await repo.createExercise({
      lessonId: from.lessonId,
      order: 1,
      type: "click_identify",
      payload: setA,
    });
    const reviewed = await repo.createExercise({
      lessonId: from.lessonId,
      order: 2,
      type: "click_identify",
      payload: setA,
    });
    await repo.transitionEntity({ kind: "exercise", id: reviewed, to: "in_review" });

    await repo.moveExercise(draft, { lessonId: to.lessonId, order: 5 });
    const [moved] = await h.db
      .select({ lessonId: schema.exercises.lessonId, order: schema.exercises.order })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, draft));
    expect(moved).toEqual({ lessonId: to.lessonId, order: 5 });
    await expect(repo.moveExercise(reviewed, { lessonId: to.lessonId, order: 6 })).rejects.toThrow(
      /only a draft moves/,
    );

    const note = await repo.createGrammarNote({
      skillId: from.skillId,
      slug: "zz-note",
      order: 1,
      caveat: "fixture",
      origin: "llm",
    });
    await repo.moveGrammarNote(note, { skillId: to.skillId, order: 2 });
    const [n] = await h.db
      .select({ skillId: schema.grammarNotes.skillId, order: schema.grammarNotes.order })
      .from(schema.grammarNotes)
      .where(eq(schema.grammarNotes.id, note));
    expect(n).toEqual({ skillId: to.skillId, order: 2 });
    expect(await statusOf(h.db, "grammarNotes", note)).toBe("ai_draft");
  });
});
