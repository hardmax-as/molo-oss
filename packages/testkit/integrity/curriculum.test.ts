/**
 * Curriculum editing through the repository: payloads are re-validated on
 * update, status can never be smuggled through a patch, only never-published
 * rows can be deleted, and the editor's tree shows drafts that the learner
 * surface never does.
 */

import { learnerRepo, type RepoError } from "@molo/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeLexeme,
  defaultCourse,
  editorA,
  editorB,
  editorRepo,
  harness,
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

async function scaffold() {
  const repo = editorRepo(h.db, editorA, { morph: yesMorph });
  const unitId = await repo.createUnit({
    slug: "zz-unit",
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await repo.createSkill({
    unitId,
    slug: "zz-skill",
    titleKey: "units.unit1.title",
    order: 1,
    kind: "vocab",
  });
  const lessonId = await repo.createLesson({ skillId, order: 1 });
  const a = await completeLexeme(h.db, { creator: editorA, lemma: "zz-a" });
  const b = await completeLexeme(h.db, { creator: editorA, lemma: "zz-b" });
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
  return { repo, unitId, skillId, lessonId, exerciseId, a, b };
}

describe("curriculum repository", () => {
  it("updateExercise re-validates the payload and recomputes referenced ids", async () => {
    const { repo, exerciseId, a, b } = await scaffold();
    await expect(
      repo.updateExercise(exerciseId, {
        payload: {
          type: "listen_select",
          prompt: { lexemeId: a },
          options: [{ lexemeId: a, correct: true }],
        },
      }),
    ).rejects.toMatchObject({ code: "invalid" } satisfies Partial<RepoError>);
    await repo.updateExercise(exerciseId, {
      payload: {
        type: "listen_select",
        prompt: { lexemeId: b },
        options: [
          { lexemeId: b, correct: true },
          { lexemeId: a, correct: false },
        ],
      },
    });
    const tree = await repo.curriculumTree();
    const ex = tree[0]?.skills[0]?.lessons[0]?.exercises[0];
    expect(ex?.lexemeCount).toBe(2);
    // Changing the type without a matching payload is rejected too.
    await expect(repo.updateExercise(exerciseId, { type: "match_pairs" })).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("patches cannot smuggle status or approval through a curriculum row", async () => {
    const { repo, unitId } = await scaffold();
    await repo.updateUnit(unitId, {
      titleKey: "units.unit1.title",
      status: "published",
      approvedBy: editorB.id,
    } as never);
    const tree = await repo.curriculumTree();
    expect(tree[0]?.status).toBe("draft");
    expect(tree[0]?.titleKey).toBe("units.unit1.title");
  });

  it("deleteDraft removes never-published rows with their children and refuses anything else", async () => {
    const { repo, unitId, exerciseId } = await scaffold();
    await repo.transitionEntity({ kind: "exercise", id: exerciseId, to: "in_review" });
    await expect(repo.deleteDraft("exercise", exerciseId)).rejects.toMatchObject({
      code: "forbidden",
    });
    // The unit is still a draft, so it can go, and the cascade takes the in_review exercise with it.
    await repo.deleteDraft("unit", unitId);
    expect(await repo.curriculumTree()).toEqual([]);
  });

  it("the editor tree shows drafts; the learner surface shows nothing until the whole graph is published", async () => {
    const { repo, unitId, skillId, lessonId, exerciseId, a, b } = await scaffold();
    expect((await repo.curriculumTree()).map((u) => u.slug)).toEqual(["zz-unit"]);
    const learner = learnerRepo(h.db);
    const course = await defaultCourse(h.db);
    expect(await learner.listUnits(course.id)).toEqual([]);
    expect(await learner.getUnitBySlug("zz-unit", course.id)).toBeNull();

    const approver = editorRepo(h.db, editorB, { morph: yesMorph });
    // Bottom up: lexemes first (completeLexeme leaves them as complete drafts), then the graph.
    for (const [kind, id] of [
      ["lexeme", a],
      ["lexeme", b],
      ["exercise", exerciseId],
      ["lesson", lessonId],
      ["skill", skillId],
      ["unit", unitId],
    ] as const) {
      const r1 = await repo.transitionEntity({ kind, id, to: "in_review" });
      expect(r1.ok).toBe(true);
      const r2 = await approver.transitionEntity({ kind, id, to: "published" });
      if (!r2.ok) throw new Error(`${kind}: ${r2.reason}`);
    }
    expect((await learner.listUnits(course.id)).map((u) => u.slug)).toEqual(["zz-unit"]);
  });
});
