/**
 * The words a learner has not met yet, against Postgres and through the real
 * `GET /units/:slug`. The lesson runner meets each of them on a card before
 * the first exercise that asks for it, so the list has to be the learner's
 * own history (the same finished-lesson rows the "new word" badge reads),
 * it may only ever name published words, and a guest never gets one: the
 * device answers that question for itself.
 */

import type { Actor, UnitResponse } from "@molo/core";
import { schema, type Db } from "@molo/db";
import { awardXp } from "@molo/gamification";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeLexeme,
  editorA,
  editorB,
  editorRepo,
  harness,
  learner,
  yesMorph,
  type Harness,
} from "./helpers.ts";

let h: Harness;
// The API's own test composition: the real learner routes, this database and
// a chosen actor (null is a guest). Imported by path, as editor-preview does.
const apiHarnessModule = "../../../apps/api/src/test/preview-harness.ts";
const {
  previewTestApp,
}: {
  previewTestApp: (
    db: Db,
    actor: Actor | null,
  ) => { request: (path: string, init?: RequestInit) => Response | Promise<Response> };
} = await import(apiHarnessModule);

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => h?.close());

/**
 * One published unit, two lessons: the first teaches `a` (with `b` only as a
 * distractor), the second teaches `c`.
 */
async function publishedUnit() {
  const repo = editorRepo(h.db, editorA, { morph: yesMorph });
  const approve = async (
    kind: "lexeme" | "exercise" | "lesson" | "skill" | "unit",
    id: string,
  ): Promise<void> => {
    const a = await repo.transitionEntity({ kind, id, to: "in_review" });
    if (!a.ok) throw new Error(`${kind} -> in_review: ${a.reason}`);
    const b = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind,
      id,
      to: "published",
    });
    if (!b.ok) throw new Error(`${kind} -> published: ${b.reason}`);
  };
  const [a, b, c] = [
    await completeLexeme(h.db, { creator: editorA, lemma: "zz-new-a" }),
    await completeLexeme(h.db, { creator: editorA, lemma: "zz-new-b" }),
    await completeLexeme(h.db, { creator: editorA, lemma: "zz-new-c" }),
  ] as const;
  for (const id of [a, b, c]) await approve("lexeme", id);
  const unitId = await repo.createUnit({
    slug: "zz-new-words",
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await repo.createSkill({
    unitId,
    slug: "zz-new-words-skill",
    titleKey: "units.unit1.title",
    order: 1,
    kind: "vocab",
  });
  const first = await repo.createLesson({ skillId, order: 1 });
  const second = await repo.createLesson({ skillId, order: 2 });
  const one = await repo.createExercise({
    lessonId: first,
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
  const two = await repo.createExercise({
    lessonId: second,
    order: 1,
    type: "listen_select",
    payload: {
      type: "listen_select",
      prompt: { lexemeId: c },
      options: [
        { lexemeId: c, correct: true },
        { lexemeId: a, correct: false },
      ],
    },
  });
  await approve("exercise", one);
  await approve("exercise", two);
  await approve("lesson", first);
  await approve("lesson", second);
  await approve("skill", skillId);
  await approve("unit", unitId);
  return { first, second, a, b, c };
}

async function unitAs(actor: Actor | null): Promise<UnitResponse> {
  const response = await previewTestApp(h.db, actor).request("/units/zz-new-words");
  expect(response.status).toBe(200);
  return (await response.json()) as UnitResponse;
}

describe("the words a learner has not met yet", () => {
  it("names every word the unit teaches to a learner who has finished nothing, never a distractor", async () => {
    const { a, b, c } = await publishedUnit();
    const unit = await unitAs(learner);
    expect(unit.unseenLexemeIds).toEqual([a, c]);
    expect(unit.unseenLexemeIds).not.toContain(b);
  });

  it("drops a finished lesson's words, from the same rows the badge reads", async () => {
    const { first, c } = await publishedUnit();
    await awardXp(h.db, learner.id, 10, "lesson", { kind: "lesson", id: first });
    const unit = await unitAs(learner);
    expect(unit.unseenLexemeIds).toEqual([c]);
    // The badge agrees: the first lesson's exercise is no longer new.
    const exercise = unit.unit.skills[0]?.lessons[0]?.exercises[0];
    expect(exercise?.moment).toBeNull();
  });

  it("never names a word that has left published", async () => {
    const { a, c } = await publishedUnit();
    await h.db.update(schema.lexemes).set({ status: "retired" }).where(eq(schema.lexemes.id, c));
    const unit = await unitAs(learner);
    expect(unit.unseenLexemeIds).toEqual([a]);
    expect(unit.lexemes[c]).toBeUndefined();
  });

  it("gives a guest no list: the device answers for itself", async () => {
    await publishedUnit();
    const unit = await unitAs(null);
    expect(unit.unseenLexemeIds).toBeUndefined();
    expect("unseenLexemeIds" in unit).toBe(false);
  });
});
