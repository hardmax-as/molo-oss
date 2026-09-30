/**
 * "Report this exercise" against Postgres.
 *
 * The rule that matters is the same one as everywhere else: a learner
 * surface only ever touches `published` rows, so a report can only be filed
 * against a published exercise. The other half is the one that keeps
 * editors safe: a report is a note. It can never move a status, and
 * resolving one leaves the exercise exactly where it was.
 *
 * The badge derivations ("new word", "tricky") are asserted here too,
 * because they read the learner's history out of `xp_events` and
 * `learner_mistakes` and must go quiet the moment a word leaves published.
 */

import { momentFor } from "@molo/core";
import { exerciseReportsRepo, learnerRepo, mistakesRepo, schema, type RepoError } from "@molo/db";
import { awardXp } from "@molo/gamification";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS } from "../src/fixtures.ts";
import {
  completeLexeme,
  defaultCourse,
  editorA,
  editorB,
  editorRepo,
  harness,
  statusOf,
  yesMorph,
  type Harness,
} from "./helpers.ts";

let h: Harness;
const learnerId = FIXTURE_USERS.learner.id;

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => {
  await h?.close();
});

/** A published unit → skill → lesson → exercise, through the real transitions. */
async function publishedLesson() {
  const repo = editorRepo(h.db, editorA, { morph: yesMorph });
  const approve = async (kind: "exercise" | "lesson" | "skill" | "unit", id: string) => {
    const a = await repo.transitionEntity({ kind, id, to: "in_review" });
    if (!a.ok) throw new Error(`${kind} -> in_review: ${a.reason}`);
    const b = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind,
      id,
      to: "published",
    });
    if (!b.ok) throw new Error(`${kind} -> published: ${b.reason}`);
  };
  const unitId = await repo.createUnit({
    slug: "zz-report-unit",
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await repo.createSkill({
    unitId,
    slug: "zz-report-skill",
    titleKey: "units.unit1.title",
    order: 1,
    kind: "vocab",
  });
  const lessonId = await repo.createLesson({ skillId, order: 1 });
  const a = await completeLexeme(h.db, { creator: editorA, lemma: "zz-report-a" });
  const b = await completeLexeme(h.db, { creator: editorA, lemma: "zz-report-b" });
  for (const id of [a, b]) {
    const toReview = await repo.transitionEntity({ kind: "lexeme", id, to: "in_review" });
    if (!toReview.ok) throw new Error(toReview.reason);
    const published = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    if (!published.ok) throw new Error(published.reason);
  }
  const exerciseId = await repo.createExercise({
    lessonId,
    order: 1,
    type: "listen_select",
    payload: {
      type: "listen_select",
      prompt: { lexemeId: a },
      options: [
        { lexemeId: a, correct: true },
        { lexemeId: b, correct: false },
      ],
    },
  });
  await approve("exercise", exerciseId);
  await approve("lesson", lessonId);
  await approve("skill", skillId);
  await approve("unit", unitId);
  // Added after the lesson published, so the lesson's own gate is satisfied:
  // an editor drafting a second exercise into a live lesson is the ordinary
  // case, and a learner must not be able to report it.
  const draftExerciseId = await repo.createExercise({
    lessonId,
    order: 2,
    type: "listen_select",
    payload: {
      type: "listen_select",
      prompt: { lexemeId: b },
      options: [
        { lexemeId: b, correct: true },
        { lexemeId: a, correct: false },
      ],
    },
  });
  return { repo, unitId, skillId, lessonId, exerciseId, draftExerciseId, a, b };
}

describe("reporting an exercise", () => {
  it("files a report against a published exercise and shows it to an editor", async () => {
    const { exerciseId } = await publishedLesson();
    const reports = exerciseReportsRepo(h.db);
    const filed = await reports.file(learnerId, {
      exerciseId,
      reason: "wrong_gloss",
      note: "  the English looks off  ",
      sourceLang: "en",
    });
    expect(filed.alreadyReported).toBe(false);
    expect(filed.id).toBeTruthy();

    const open = await reports.list();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      exerciseId,
      exerciseType: "listen_select",
      exerciseStatus: "published",
      reason: "wrong_gloss",
      // Trimmed on the way in; an editor reads it in a table.
      note: "the English looks off",
      sourceLang: "en",
      resolvedAt: null,
    });
    expect(await reports.openCount()).toBe(1);
  });

  it("refuses a report against anything that is not a published exercise", async () => {
    const { draftExerciseId } = await publishedLesson();
    const reports = exerciseReportsRepo(h.db);
    await expect(
      reports.file(learnerId, {
        exerciseId: draftExerciseId,
        reason: "other",
        sourceLang: "en",
      }),
    ).rejects.toMatchObject({ code: "not_found" } satisfies Partial<RepoError>);
    await expect(
      reports.file(learnerId, {
        exerciseId: "00000000-0000-4000-8000-0000000000ff",
        reason: "other",
        sourceLang: "en",
      }),
    ).rejects.toMatchObject({ code: "not_found" } satisfies Partial<RepoError>);
    expect(await reports.openCount()).toBe(0);
  });

  it("does not file the same open complaint twice", async () => {
    const { exerciseId } = await publishedLesson();
    const reports = exerciseReportsRepo(h.db);
    await reports.file(learnerId, { exerciseId, reason: "typo", sourceLang: "en" });
    const again = await reports.file(learnerId, { exerciseId, reason: "typo", sourceLang: "en" });
    expect(again.alreadyReported).toBe(true);
    expect(await reports.openCount()).toBe(1);
    // A different complaint about the same exercise is a different report.
    await reports.file(learnerId, { exerciseId, reason: "audio_problem", sourceLang: "en" });
    expect(await reports.openCount()).toBe(2);
  });

  it("resolving a report never touches the exercise", async () => {
    const { exerciseId } = await publishedLesson();
    const reports = exerciseReportsRepo(h.db);
    const filed = await reports.file(learnerId, {
      exerciseId,
      reason: "wrong_answer",
      sourceLang: "nb",
    });
    await reports.resolve(editorA.id, filed.id as string, true);
    expect(await reports.openCount()).toBe(0);
    expect(await reports.list()).toHaveLength(0);
    expect(await reports.list({ open: false })).toHaveLength(1);
    expect(await statusOf(h.db, "exercises", exerciseId)).toBe("published");

    // Reopening puts it back in the queue and still leaves the content alone.
    await reports.resolve(editorA.id, filed.id as string, false);
    expect(await reports.openCount()).toBe(1);
    expect(await statusOf(h.db, "exercises", exerciseId)).toBe("published");
    await expect(
      reports.resolve(editorA.id, "00000000-0000-4000-8000-0000000000ff", true),
    ).rejects.toMatchObject({ code: "not_found" } satisfies Partial<RepoError>);
  });

  it("a report survives the exercise being retired, and names its real status", async () => {
    const { repo, exerciseId } = await publishedLesson();
    const reports = exerciseReportsRepo(h.db);
    await reports.file(learnerId, { exerciseId, reason: "wrong_gloss", sourceLang: "en" });
    // `published -> retired` is the only way out of published in the status
    // machine, and it is the one an editor reaches for after a report.
    const pulled = await repo.transitionEntity({
      kind: "exercise",
      id: exerciseId,
      to: "retired",
      note: "reported by a learner",
    });
    expect(pulled.ok).toBe(true);
    const [row] = await reports.list();
    expect(row?.exerciseStatus).toBe("retired");
    // And the learner can no longer report the retired exercise.
    await expect(
      reports.file(learnerId, { exerciseId, reason: "typo", sourceLang: "en" }),
    ).rejects.toMatchObject({ code: "not_found" } satisfies Partial<RepoError>);
  });
});

describe("the badge above the prompt", () => {
  it("calls a word new until a lesson that teaches it is finished", async () => {
    const { lessonId, a } = await publishedLesson();
    const repo = learnerRepo(h.db);
    const unit = await repo.getUnitBySlug("zz-report-unit", (await defaultCourse(h.db)).id);
    const exercise = unit?.skills[0]?.lessons[0]?.exercises[0];
    expect(exercise?.teaches).toEqual([a]);

    const before = await repo.seenLexemeIds(learnerId);
    expect(
      momentFor({
        teaches: exercise?.teaches ?? [],
        seen: before,
        tricky: new Set(),
      }),
    ).toBe("new_word");

    // Finishing the lesson is what makes the word "met": the same xp_events
    // row the prerequisite rule reads.
    await awardXp(h.db, learnerId, 10, "lesson", { kind: "lesson", id: lessonId });
    const after = await repo.seenLexemeIds(learnerId);
    expect(after.has(a)).toBe(true);
    expect(
      momentFor({ teaches: exercise?.teaches ?? [], seen: after, tricky: new Set() }),
    ).toBeNull();
  });

  it("calls a missed word tricky, and stops the moment the word leaves published", async () => {
    const { lessonId, exerciseId: _exerciseId, a } = await publishedLesson();
    await awardXp(h.db, learnerId, 10, "lesson", { kind: "lesson", id: lessonId });
    const mistakes = mistakesRepo(h.db);
    await mistakes.record(learnerId, [{ lexemeId: a, exerciseType: "listen_select" }]);

    const seen = await learnerRepo(h.db).seenLexemeIds(learnerId);
    expect(momentFor({ teaches: [a], seen, tricky: await mistakes.openLexemeIds(learnerId) })).toBe(
      "tricky",
    );

    // Retired by an editor: the mistake row stays, the badge stops.
    await h.db.update(schema.lexemes).set({ status: "retired" }).where(eq(schema.lexemes.id, a));
    expect(
      momentFor({ teaches: [a], seen, tricky: await mistakes.openLexemeIds(learnerId) }),
    ).toBeNull();
  });

  it("never names an unpublished word among the words an exercise teaches", async () => {
    const { a, b } = await publishedLesson();
    await h.db.update(schema.lexemes).set({ status: "retired" }).where(eq(schema.lexemes.id, b));
    const unit = await learnerRepo(h.db).getUnitBySlug(
      "zz-report-unit",
      (await defaultCourse(h.db)).id,
    );
    const teaches = unit?.skills[0]?.lessons[0]?.exercises[0]?.teaches ?? [];
    expect(teaches).toEqual([a]);
    expect(teaches).not.toContain(b);
  });
});
