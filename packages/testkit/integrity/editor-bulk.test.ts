/**
 * Bulk transitions and review-queue assignment (docs/NEXT.md item 9).
 *
 * The grid's bulk actions exist for speed, not for a shortcut through the
 * status machine. These assertions pin that down: a batch is exactly N
 * single transitions, one blocked row never carries the others through, and
 * `ai_draft → published` stays impossible in a batch that publishes
 * everything else.
 */

import { schema } from "@molo/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  LICENCE,
  SOURCE,
  admin,
  completeLexeme,
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

const repoA = () => editorRepo(h.db, editorA, { morph: yesMorph });
const repoB = () => editorRepo(h.db, editorB, { morph: yesMorph });

/** A lexeme that would publish if nothing else stood in the way, already in review. */
async function readyToPublish(): Promise<string> {
  const id = await completeLexeme(h.db, { creator: editorA });
  const r = await repoA().transitionEntity({ kind: "lexeme", id, to: "in_review" });
  expect(r.ok).toBe(true);
  return id;
}

/** In review, but with no audio at all: the gate must refuse it. */
async function inReviewWithoutAudio(): Promise<string> {
  const repo = repoA();
  const id = await repo.createLexeme({
    lemma: `zz-noaudio-${crypto.randomUUID().slice(0, 8)}`,
    pos: "noun",
    nounClassLabel: "13",
    source: SOURCE,
    licence: LICENCE,
    origin: "human",
  });
  await repo.upsertGloss(id, { sourceLang: "en", gloss: "fixture gloss en", origin: "human" });
  await repo.upsertGloss(id, { sourceLang: "nb", gloss: "fixture gloss nb", origin: "human" });
  const r = await repo.transitionEntity({ kind: "lexeme", id, to: "in_review" });
  expect(r.ok).toBe(true);
  return id;
}

async function aiDraft(): Promise<string> {
  return repoA().createLexeme({
    lemma: `zz-ai-${crypto.randomUUID().slice(0, 8)}`,
    pos: "verb",
    source: "llm",
    licence: LICENCE,
    origin: "llm",
  });
}

describe("bulk transitions apply the per-row rules", () => {
  it("promotes a whole selection of drafts to in_review", async () => {
    const ids = [
      await completeLexeme(h.db, { creator: editorA }),
      await completeLexeme(h.db, { creator: editorA }),
    ];
    const out = await repoA().transitionMany({ kind: "lexeme", ids, to: "in_review" });
    expect(out.map((o) => o.ok)).toEqual([true, true]);
    for (const id of ids) expect(await statusOf(h.db, "lexemes", id)).toBe("in_review");
  });

  it("publishes the rows that pass the gate and blocks the one that does not", async () => {
    const good = await readyToPublish();
    const bad = await inReviewWithoutAudio();
    const out = await repoB().transitionMany({ kind: "lexeme", ids: [good, bad], to: "published" });
    const byId = new Map(out.map((o) => [o.id, o]));

    expect(byId.get(good)).toEqual({ id: good, ok: true, status: "published" });
    expect(await statusOf(h.db, "lexemes", good)).toBe("published");

    const blocked = byId.get(bad);
    expect(blocked?.ok).toBe(false);
    // The blocked row carries the gate's own reasons, not a generic failure.
    expect(blocked && !blocked.ok ? blocked.gate?.failures.map((f) => f.code) : []).toContain(
      "audio_missing",
    );
    // And it is untouched: a batch never half-publishes a row.
    expect(await statusOf(h.db, "lexemes", bad)).toBe("in_review");
  });

  it("refuses ai_draft -> published inside a batch that publishes everything else", async () => {
    const good = await readyToPublish();
    const ai = await aiDraft();
    const out = await repoB().transitionMany({ kind: "lexeme", ids: [good, ai], to: "published" });
    const byId = new Map(out.map((o) => [o.id, o]));
    expect(byId.get(good)?.ok).toBe(true);
    const refused = byId.get(ai);
    expect(refused?.ok).toBe(false);
    expect(refused && !refused.ok ? refused.reason : "").toMatch(/ai_draft/);
    expect(await statusOf(h.db, "lexemes", ai)).toBe("ai_draft");
  });

  it("keeps four eyes: the creator cannot publish their own rows in bulk", async () => {
    const id = await readyToPublish();
    const out = await repoA().transitionMany({ kind: "lexeme", ids: [id], to: "published" });
    expect(out[0]?.ok).toBe(false);
    expect(out[0] && !out[0].ok ? out[0].reason : "").toMatch(/four-eyes/);
    expect(await statusOf(h.db, "lexemes", id)).toBe("in_review");
  });

  it("still requires a note for draft and retired, per row", async () => {
    const id = await readyToPublish();
    const noNote = await repoB().transitionMany({ kind: "lexeme", ids: [id], to: "draft" });
    expect(noNote[0]?.ok).toBe(false);
    expect(await statusOf(h.db, "lexemes", id)).toBe("in_review");

    const withNote = await repoB().transitionMany({
      kind: "lexeme",
      ids: [id],
      to: "draft",
      note: "needs a second look at the class",
    });
    expect(withNote[0]?.ok).toBe(true);
    expect(await statusOf(h.db, "lexemes", id)).toBe("draft");
  });

  it("reports a missing row instead of failing the whole batch", async () => {
    const good = await completeLexeme(h.db, { creator: editorA });
    const missing = "00000000-0000-4000-8000-0000000000ff";
    const out = await repoA().transitionMany({
      kind: "lexeme",
      ids: [good, missing],
      to: "in_review",
    });
    expect(out.find((o) => o.id === good)?.ok).toBe(true);
    expect(out.find((o) => o.id === missing)?.ok).toBe(false);
  });

  it("applies a repeated id once", async () => {
    const id = await completeLexeme(h.db, { creator: editorA });
    const out = await repoA().transitionMany({ kind: "lexeme", ids: [id, id], to: "in_review" });
    expect(out).toHaveLength(1);
  });

  it("writes one revision row per applied transition and none for a blocked one", async () => {
    const good = await readyToPublish();
    const bad = await inReviewWithoutAudio();
    await repoB().transitionMany({ kind: "lexeme", ids: [good, bad], to: "published" });
    const rows = await h.db
      .select({
        entityId: schema.contentRevisions.entityId,
        diff: schema.contentRevisions.diff,
      })
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.entityKind, "lexeme"));
    const statusMoves = (id: string) =>
      rows
        .filter((r) => r.entityId === id && "status" in r.diff)
        .map((r) => (r.diff as { status: { from: string; to: string } }).status.to);
    // The blocked row kept its promotion and gained nothing from the refusal.
    expect(statusMoves(bad)).toEqual(["in_review"]);
    expect(statusMoves(good)).toEqual(["in_review", "published"]);
  });

  it("is closed to a learner, like every other editorial write", () => {
    expect(() => editorRepo(h.db, learner, { morph: yesMorph })).toThrow(/editorial/);
  });
});

describe("review-queue assignment", () => {
  it("shows in_review rows and filters by assignee", async () => {
    const id = await readyToPublish();
    const all = await repoA().reviewQueue();
    expect(all.map((r) => r.entityId)).toContain(id);

    expect((await repoA().reviewQueue({ filter: "unassigned" })).map((r) => r.entityId)).toContain(
      id,
    );
    expect((await repoA().reviewQueue({ filter: "mine" })).map((r) => r.entityId)).not.toContain(
      id,
    );

    await repoA().assignReview({ kind: "lexeme", id, assignedTo: editorA.id });
    const mine = await repoA().reviewQueue({ filter: "mine" });
    expect(mine.map((r) => r.entityId)).toContain(id);
    expect(mine.find((r) => r.entityId === id)?.assignedToName).toBe("Fixture Editor A");
    expect(mine.find((r) => r.entityId === id)?.assignedAt).toBeTruthy();
    expect(
      (await repoA().reviewQueue({ filter: "unassigned" })).map((r) => r.entityId),
    ).not.toContain(id);
  });

  it("records who assigned in the editorial history", async () => {
    const id = await readyToPublish();
    await repoB().assignReview({ kind: "lexeme", id, assignedTo: editorB.id });
    const [row] = await h.db
      .select({ diff: schema.contentRevisions.diff, actorId: schema.contentRevisions.actorId })
      .from(schema.contentRevisions)
      .where(
        and(
          eq(schema.contentRevisions.entityKind, "lexeme"),
          eq(schema.contentRevisions.entityId, id),
        ),
      )
      .orderBy(schema.contentRevisions.createdAt);
    expect(row).toBeTruthy();
    const assignment = await h.db
      .select({
        assignedTo: schema.reviewAssignments.assignedTo,
        assignedBy: schema.reviewAssignments.assignedBy,
      })
      .from(schema.reviewAssignments)
      .where(eq(schema.reviewAssignments.entityId, id));
    expect(assignment[0]).toEqual({ assignedTo: editorB.id, assignedBy: editorB.id });
  });

  it("lets an editor release their own item but not take one from someone else", async () => {
    const id = await readyToPublish();
    await repoA().assignReview({ kind: "lexeme", id, assignedTo: editorA.id });
    await expect(
      repoB().assignReview({ kind: "lexeme", id, assignedTo: editorB.id }),
    ).rejects.toThrow(/admin/);
    await repoA().assignReview({ kind: "lexeme", id, assignedTo: null });
    const after = await repoA().reviewQueue({ filter: "unassigned" });
    expect(after.map((r) => r.entityId)).toContain(id);
  });

  it("lets an admin hand an item to another editor, and refuses a non-editorial target", async () => {
    const id = await readyToPublish();
    await repoA().assignReview({ kind: "lexeme", id, assignedTo: editorA.id });
    const adminRepo = editorRepo(h.db, admin, { morph: yesMorph });
    await adminRepo.assignReview({ kind: "lexeme", id, assignedTo: editorB.id });
    const rows = await adminRepo.reviewQueue();
    expect(rows.find((r) => r.entityId === id)?.assignedTo).toBe(editorB.id);
    await expect(
      adminRepo.assignReview({ kind: "lexeme", id, assignedTo: learner.id }),
    ).rejects.toThrow(/editorial/);
  });

  it("never changes a status", async () => {
    const id = await readyToPublish();
    await repoA().assignReview({ kind: "lexeme", id, assignedTo: editorA.id });
    expect(await statusOf(h.db, "lexemes", id)).toBe("in_review");
  });
});
