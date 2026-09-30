/**
 * Practise mistakes and unit prerequisites against Postgres.
 *
 * The rule that matters here is the same one as everywhere else: a learner
 * surface only ever sees `published` rows. A mistake row survives its
 * lexeme being pulled back into review, but the learner stops being shown
 * it. The prerequisite half asserts the queries the lock is computed from.
 */

import { lockedUnitIds } from "@molo/core";
import { editorRepo, learnerRepo, mistakesRepo, schema } from "@molo/db";
import { awardXp, completedLessonIds } from "@molo/gamification";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS } from "../src/fixtures.ts";
import {
  completeLexeme,
  defaultCourse,
  editorA,
  editorB,
  harness,
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

async function publishedLexeme(lemma: string): Promise<string> {
  const id = await completeLexeme(h.db, { creator: editorA, lemma });
  await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
    kind: "lexeme",
    id,
    to: "in_review",
  });
  const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
    kind: "lexeme",
    id,
    to: "published",
  });
  if (!r.ok) throw new Error(r.reason);
  return id;
}

describe("practise mistakes", () => {
  it("files only published lexemes and never serves an unpublished one", async () => {
    const published = await publishedLexeme("zz-miss-a");
    const draft = await editorRepo(h.db, editorA, { morph: yesMorph }).createLexeme({
      lemma: "zz-miss-draft",
      pos: "noun",
      nounClassLabel: "13",
      source: "fixture",
      licence: "CC-BY-SA-4.0",
      origin: "human",
    });
    const repo = mistakesRepo(h.db);
    expect(
      await repo.record(learnerId, [
        { lexemeId: published, exerciseType: "listen_select" },
        { lexemeId: draft, exerciseType: "listen_select" },
      ]),
    ).toBe(1);
    expect((await repo.open(learnerId)).map((m) => m.lexemeId)).toEqual([published]);
    expect(await repo.openCount(learnerId)).toBe(1);
  });

  it("bumps the counter on a repeat and stops serving a word that leaves published", async () => {
    const id = await publishedLexeme("zz-miss-b");
    const repo = mistakesRepo(h.db);
    await repo.record(learnerId, [{ lexemeId: id, exerciseType: "listen_select" }]);
    await repo.record(learnerId, [{ lexemeId: id, exerciseType: "listen_select" }]);
    expect((await repo.open(learnerId))[0]?.timesWrong).toBe(2);

    // Retired by an editor: the row stays, the learner stops seeing it.
    await h.db.update(schema.lexemes).set({ status: "retired" }).where(eq(schema.lexemes.id, id));
    expect(await repo.open(learnerId)).toEqual([]);
    expect(await repo.openCount(learnerId)).toBe(0);
  });

  it("clears on a right answer and reopens the same row when the word is missed again", async () => {
    const id = await publishedLexeme("zz-miss-c");
    const repo = mistakesRepo(h.db);
    await repo.record(learnerId, [{ lexemeId: id, exerciseType: "listen_select" }]);

    expect(await repo.resolve(learnerId, id, false)).toMatchObject({ timesWrong: 2 });
    expect(await repo.resolve(learnerId, id, true)).toMatchObject({ cleared: true });
    expect(await repo.openCount(learnerId)).toBe(0);
    // Nothing open any more: a second right answer has nothing to clear.
    expect(await repo.resolve(learnerId, id, true)).toBeNull();

    await repo.record(learnerId, [{ lexemeId: id, exerciseType: "listen_select" }]);
    const [row] = await repo.open(learnerId);
    expect(row?.timesWrong).toBe(3);
    const all = await h.db
      .select()
      .from(schema.learnerMistakes)
      .where(eq(schema.learnerMistakes.userId, learnerId));
    expect(all).toHaveLength(1); // one row per (learner, word, exercise type)
  });
});

describe("unit prerequisites", () => {
  /** Two published units, the second depending on the first, one lesson each. */
  async function twoUnits(): Promise<{
    first: string;
    second: string;
    firstLesson: string;
    secondLesson: string;
  }> {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const lexeme = await publishedLexeme("zz-prereq");
    const publish = async (kind: "exercise" | "lesson" | "skill" | "unit", id: string) => {
      const a = await repo.transitionEntity({ kind, id, to: "in_review" });
      if (!a.ok) throw new Error(a.reason);
      const b = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
        kind,
        id,
        to: "published",
      });
      if (!b.ok) throw new Error(b.reason);
    };
    const build = async (slug: string, order: number, prerequisiteUnitId?: string) => {
      const unitId = await repo.createUnit({
        slug,
        titleKey: "units.unit1.title",
        order,
        cefrBand: "A1",
        ...(prerequisiteUnitId ? { prerequisiteUnitId } : {}),
      });
      const skillId = await repo.createSkill({
        unitId,
        slug: `${slug}-skill`,
        titleKey: "units.unit1.skills.greetings.title",
        order: 1,
        kind: "vocab",
      });
      const lessonId = await repo.createLesson({ skillId, order: 1 });
      const exerciseId = await repo.createExercise({
        lessonId,
        order: 1,
        type: "listen_select",
        payload: {
          type: "listen_select",
          prompt: { lexemeId: lexeme },
          options: [
            { lexemeId: lexeme, correct: true },
            { lexemeId: lexeme, correct: false },
          ],
        },
      });
      await publish("exercise", exerciseId);
      await publish("lesson", lessonId);
      await publish("skill", skillId);
      await publish("unit", unitId);
      return { unitId, lessonId };
    };
    const a = await build("zz-prereq-one", 1);
    const b = await build("zz-prereq-two", 2, a.unitId);
    return {
      first: a.unitId,
      second: b.unitId,
      firstLesson: a.lessonId,
      secondLesson: b.lessonId,
    };
  }

  it("locks the dependent unit until every lesson of its prerequisite is completed", async () => {
    const { first, second, firstLesson } = await twoUnits();
    const repo = learnerRepo(h.db);
    const course = await defaultCourse(h.db);
    const units = await repo.listUnits(course.id);
    const index = await repo.unitContentIndex(course.id);
    expect(index.find((i) => i.unitId === first)?.lessonIds).toEqual([firstLesson]);

    const finishedFor = async (): Promise<Set<string>> => {
      const done = await completedLessonIds(
        h.db,
        learnerId,
        index.flatMap((i) => [...i.lessonIds]),
      );
      return new Set(
        index
          .filter((i) => i.lessonIds.length > 0 && i.lessonIds.every((id) => done.has(id)))
          .map((i) => i.unitId),
      );
    };

    expect([...lockedUnitIds(units, await finishedFor())]).toEqual([second]);

    // The lock lifts when the prerequisite's only lesson is credited.
    await awardXp(h.db, learnerId, 10, "lesson", { kind: "lesson", id: firstLesson });
    expect([...lockedUnitIds(units, await finishedFor())]).toEqual([]);
  });
});
