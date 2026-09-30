/**
 * The path against Postgres: nodes carry the kind their exercises imply,
 * crown levels count real completions, and the end-of-skill chest grants
 * its XP exactly once however hard a client tries. The last one is the
 * point of the table — a bonus a replayed lesson could farm would be a
 * live XP exploit, so the unique constraint is tested, not assumed.
 */

import { XP } from "@molo/core";
import { pathRepo, schema } from "@molo/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS } from "../src/fixtures.ts";
import {
  completeLexeme,
  editorA,
  editorB,
  editorRepo,
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

async function publish(kind: "exercise" | "lesson" | "skill" | "unit", id: string) {
  const a = await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
    kind,
    id,
    to: "in_review",
  });
  if (!a.ok) throw new Error(`${kind} -> in_review: ${a.reason}`);
  const b = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
    kind,
    id,
    to: "published",
  });
  if (!b.ok) throw new Error(`${kind} -> published: ${b.reason}`);
}

/** One published unit: a skill with two lessons, listening then speaking. */
async function scaffold() {
  const repo = editorRepo(h.db, editorA, { morph: yesMorph });
  const a = await completeLexeme(h.db, { creator: editorA, lemma: "zz-path-a" });
  const b = await completeLexeme(h.db, { creator: editorA, lemma: "zz-path-b" });
  for (const id of [a, b]) {
    await repo.transitionEntity({ kind: "lexeme", id, to: "in_review" });
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "lexeme",
      id,
      to: "published",
    });
    if (!r.ok) throw new Error(r.reason);
  }
  const unitId = await repo.createUnit({
    slug: "zz-path-unit",
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await repo.createSkill({
    unitId,
    slug: "zz-path-skill",
    titleKey: "units.unit1.skills.greetings.title",
    order: 1,
    kind: "vocab",
  });
  const listening = await repo.createLesson({ skillId, order: 1 });
  const speaking = await repo.createLesson({ skillId, order: 2 });
  const ex1 = await repo.createExercise({
    lessonId: listening,
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
  const ex2 = await repo.createExercise({
    lessonId: speaking,
    order: 1,
    type: "select_listen",
    payload: {
      type: "select_listen",
      prompt: { lexemeId: b },
      options: [
        { lexemeId: b, correct: true },
        { lexemeId: a, correct: false },
      ],
    },
  });
  for (const id of [ex1, ex2]) await publish("exercise", id);
  for (const id of [listening, speaking]) await publish("lesson", id);
  await publish("skill", skillId);
  await publish("unit", unitId);
  return { unitId, skillId, listening, speaking };
}

/** Records a lesson completion the way the API does: one xp_event per finish. */
async function finish(lessonId: string) {
  await h.db.insert(schema.xpEvents).values({
    userId: learnerId,
    amount: 20,
    reason: "lesson",
    refKind: "lesson",
    refId: lessonId,
  });
}

describe("path overview", () => {
  it("gives every node the kind its exercises imply, and crowns the unit's last lesson", async () => {
    const { listening } = await scaffold();
    const [unit] = await pathRepo(h.db).overview(learnerId);
    const lessons = unit!.skills[0]!.lessons;
    expect(lessons.map((l) => l.kind)).toEqual(["listen", "test"]);
    expect(lessons[0]!.id).toBe(listening);
    expect(lessons.every((l) => l.exerciseCount === 1)).toBe(true);
  });

  it("counts completions as crown levels, and shows a guest none of them", async () => {
    const { listening } = await scaffold();
    await finish(listening);
    await finish(listening);
    const [mine] = await pathRepo(h.db).overview(learnerId);
    expect(mine!.skills[0]!.lessons[0]!.crownLevel).toBe(2);
    const [guest] = await pathRepo(h.db).overview(null);
    expect(guest!.skills[0]!.lessons[0]!.crownLevel).toBe(0);
    expect(guest!.skills[0]!.chestClaimed).toBe(false);
  });

  it("never shows an unpublished lesson on the path", async () => {
    const { skillId } = await scaffold();
    const draft = await editorRepo(h.db, editorA, { morph: yesMorph }).createLesson({
      skillId,
      order: 3,
    });
    const [unit] = await pathRepo(h.db).overview(learnerId);
    expect(unit!.skills[0]!.lessons.map((l) => l.id)).not.toContain(draft);
  });
});

describe("the chest at the end of a skill", () => {
  it("stays shut until every lesson in the skill is finished", async () => {
    const { skillId, listening } = await scaffold();
    const repo = pathRepo(h.db);
    expect(await repo.claimChest(learnerId, skillId, XP.skillChest)).toEqual({
      ok: false,
      reason: "not_ready",
    });
    await finish(listening);
    expect(await repo.claimChest(learnerId, skillId, XP.skillChest)).toEqual({
      ok: false,
      reason: "not_ready",
    });
  });

  it("grants its XP exactly once, however many times it is claimed", async () => {
    const { skillId, listening, speaking } = await scaffold();
    const repo = pathRepo(h.db);
    await finish(listening);
    await finish(speaking);

    const first = await repo.claimChest(learnerId, skillId, XP.skillChest);
    expect(first).toEqual({ ok: true, xp: XP.skillChest, alreadyClaimed: false });

    // Replaying a lesson must not reopen it: the row, not the lesson tally, is the receipt.
    await finish(listening);
    const second = await repo.claimChest(learnerId, skillId, XP.skillChest);
    expect(second).toEqual({ ok: true, xp: 0, alreadyClaimed: true });

    const rows = await h.db.select().from(schema.skillChests);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.xpAwarded).toBe(XP.skillChest);
    expect((await repo.claimedSkillIds(learnerId)).has(skillId)).toBe(true);
  });

  it("refuses a skill that is not published", async () => {
    await scaffold();
    const hidden = await editorRepo(h.db, editorA, { morph: yesMorph }).createSkill({
      unitId: (await pathRepo(h.db).overview(learnerId))[0]!.id,
      slug: "zz-path-draft-skill",
      titleKey: "units.unit1.skills.clicks.title",
      order: 2,
      kind: "vocab",
    });
    expect(await pathRepo(h.db).claimChest(learnerId, hidden, XP.skillChest)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
