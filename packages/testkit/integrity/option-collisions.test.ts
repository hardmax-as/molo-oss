/**
 * Audit M02: an exercise whose option tiles read the same ("hello" twice)
 * cannot publish. The learner could not tell the tiles apart and would lose
 * a heart for a defensible choice. The gate compares lemmas and every source
 * language's gloss; fixing the gloss is left to an editor, and once the
 * tiles differ the exercise publishes as before.
 */

import type { ExercisePayload } from "@molo/core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  completeLexeme,
  editorA,
  editorB,
  editorRepo,
  harness,
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

async function publishedLexemes(lemmas: string[]) {
  const author = editorRepo(h.db, editorA, { morph: yesMorph });
  const approver = editorRepo(h.db, editorB, { morph: yesMorph });
  const ids: string[] = [];
  for (const lemma of lemmas) {
    const id = await completeLexeme(h.db, { creator: editorA, lemma });
    await author.transitionEntity({ kind: "lexeme", id, to: "in_review" });
    const r = await approver.transitionEntity({ kind: "lexeme", id, to: "published" });
    expect(r.ok).toBe(true);
    ids.push(id);
  }
  return ids;
}

async function exerciseInReview(slug: string, payload: ExercisePayload) {
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
    kind: "vocab",
  });
  const lessonId = await repo.createLesson({ skillId, order: 1 });
  const id = await repo.createExercise({ lessonId, order: 1, type: payload.type, payload });
  await repo.transitionEntity({ kind: "exercise", id, to: "in_review" });
  return id;
}

describe("an exercise with two options that read the same cannot publish", () => {
  it("refuses a listen_select whose distractor shares the answer's English gloss", async () => {
    const [a, b, c] = await publishedLexemes(["zz-oc-a", "zz-oc-b", "zz-oc-c"]);
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    // The same English, spelled a little differently: case and punctuation do not tell tiles apart.
    await author.upsertGloss(b!, { sourceLang: "en", gloss: "Fixture hello", origin: "human" });
    await author.upsertGloss(c!, { sourceLang: "en", gloss: "fixture hello!", origin: "human" });
    const id = await exerciseInReview("zz-oc-u1", {
      type: "listen_select",
      prompt: { lexemeId: b! },
      options: [
        { lexemeId: a!, correct: false },
        { lexemeId: b!, correct: true },
        { lexemeId: c!, correct: false },
      ],
    });
    const approver = editorRepo(h.db, editorB, { morph: yesMorph });

    const blocked = await approver.transitionEntity({ kind: "exercise", id, to: "published" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok)
      expect(blocked.gate?.failures).toEqual([
        { code: "option_labels_collide", detail: "en:Fixture hello" },
      ]);
    expect(await statusOf(h.db, "exercises", id)).toBe("in_review");

    // An editor rewrites one gloss; the tiles now differ and the exercise publishes.
    await author.upsertGloss(c!, { sourceLang: "en", gloss: "fixture goodbye", origin: "human" });
    const ok = await approver.transitionEntity({ kind: "exercise", id, to: "published" });
    expect(ok).toEqual({ ok: true, status: "published" });
  });

  it("checks Norwegian separately and covers match_pairs", async () => {
    const [a, b] = await publishedLexemes(["zz-oc-d", "zz-oc-e"]);
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    await author.upsertGloss(a!, { sourceLang: "nb", gloss: "fikstur hei", origin: "human" });
    await author.upsertGloss(b!, { sourceLang: "nb", gloss: "fikstur hei", origin: "human" });
    const id = await exerciseInReview("zz-oc-u2", {
      type: "match_pairs",
      pairs: [{ lexemeId: a! }, { lexemeId: b! }],
    });
    const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "exercise",
      id,
      to: "published",
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.gate?.failures).toContainEqual({
        code: "option_labels_collide",
        detail: "nb:fikstur hei",
      });
  });

  it("the read-only publish check reports the same collision", async () => {
    const [a, b] = await publishedLexemes(["zz-oc-f", "zz-oc-g"]);
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    await author.upsertGloss(b!, {
      sourceLang: "en",
      gloss: "fixture gloss en (zz-oc-f)",
      origin: "human",
    });
    const id = await exerciseInReview("zz-oc-u3", {
      type: "select_listen",
      prompt: { lexemeId: a! },
      options: [
        { lexemeId: a!, correct: true },
        { lexemeId: b!, correct: false },
      ],
    });
    const gate = await editorRepo(h.db, editorB, { morph: yesMorph }).publishCheck("exercise", id);
    expect(gate.ok).toBe(false);
    expect(gate.failures.map((f) => f.code)).toContain("option_labels_collide");
  });
});
