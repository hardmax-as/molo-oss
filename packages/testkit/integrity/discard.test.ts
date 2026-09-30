/**
 * Cleaning up tests and slips against Postgres: an unpublished take can be
 * deleted by whoever uploaded it or an admin, and a written sentence can be
 * taken back while it is a draft nothing uses. Published content is never
 * deleted this way; it is retired.
 */

import { CLICK_SOUNDS } from "@molo/core";
import { schema, tutorRepo } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SPEAKER_ID } from "../src/fixtures.ts";
import {
  admin,
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

function take(targetKind: "click" | "sentence", targetId: string) {
  return {
    targetKind,
    targetId,
    speakerId: FIXTURE_SPEAKER_ID,
    tier: "1_native_studio" as const,
    r2Key: `audio/${"d".repeat(64)}.opus`,
    sha256: "d".repeat(64),
    durationMs: 700,
    lufs: -16,
    peakDbfs: -1.5,
    codec: "opus",
    sampleRate: 48_000,
    licence: "proprietary-molo",
  };
}

const c = CLICK_SOUNDS.find((s) => s.letter === "c")!;

async function audioRow(id: string) {
  const [row] = await h.db
    .select({ id: schema.audioAssets.id })
    .from(schema.audioAssets)
    .where(eq(schema.audioAssets.id, id));
  return row ?? null;
}

describe("deleting a take", () => {
  it("lets the uploader delete an unpublished take and keeps the history", async () => {
    const a = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await a.createAudioAsset(take("click", c.id));
    expect(await a.discardAudio(id)).toEqual({ r2Key: `audio/${"d".repeat(64)}.opus` });
    expect(await audioRow(id)).toBeNull();
    const revs = await h.db
      .select({ diff: schema.contentRevisions.diff })
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.entityId, id));
    expect(revs.map((r) => r.diff)).toContainEqual(
      expect.objectContaining({
        deleted: expect.objectContaining({ targetKind: "click", targetId: c.id }),
      }),
    );
  });

  it("refuses another editor, lets an admin, and never deletes published audio", async () => {
    const a = editorRepo(h.db, editorA, { morph: yesMorph });
    const mine = await a.createAudioAsset(take("click", c.id));
    await expect(editorRepo(h.db, editorB, { morph: yesMorph }).discardAudio(mine)).rejects.toThrow(
      /uploader or an admin/,
    );
    await editorRepo(h.db, admin, { morph: yesMorph }).discardAudio(mine);
    expect(await audioRow(mine)).toBeNull();

    const live = await a.createAudioAsset(take("click", c.id));
    await a.transitionEntity({ kind: "audio_asset", id: live, to: "in_review" });
    const approved = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "audio_asset",
      id: live,
      to: "published",
    });
    expect(approved.ok).toBe(true);
    await expect(a.discardAudio(live)).rejects.toThrow(/published/);
    expect(await audioRow(live)).not.toBeNull();
  });
});

async function writtenRequest() {
  const a = editorRepo(h.db, editorA, { morph: yesMorph });
  const course = await defaultCourse(h.db);
  const unitId = await a.createUnit({
    courseId: course.id,
    slug: `zz-take-back-${crypto.randomUUID().slice(0, 8)}`,
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
  });
  const skillId = await a.createSkill({
    unitId,
    slug: "zz-take-back-skill",
    titleKey: "units.unit1.skills.greetings.title",
    order: 1,
    kind: "vocab",
  });
  const word = await completeLexeme(h.db, { lemma: "zz-take-back" });
  const requestId = await tutorRepo(h.db, editorA).createRequest({
    skillId,
    slug: "zz-req",
    order: 1,
    promptEn: "zz prompt",
    promptNb: "zz setning",
    note: null,
    targetLexemeIds: [word],
  });
  const { sentenceId } = await tutorRepo(h.db, editorB, { morph: yesMorph }).fulfilRequest(
    requestId,
    { textXh: "zz test sentence" },
  );
  return { requestId, sentenceId };
}

async function requestRow(id: string) {
  const [row] = await h.db
    .select({
      status: schema.sentenceRequests.status,
      sentenceId: schema.sentenceRequests.fulfilledSentenceId,
    })
    .from(schema.sentenceRequests)
    .where(eq(schema.sentenceRequests.id, id));
  return row;
}

describe("taking a written sentence back", () => {
  it("deletes the draft and opens the request again, for the writer", async () => {
    const { requestId, sentenceId } = await writtenRequest();
    await expect(tutorRepo(h.db, editorA).reopenRequest(requestId)).rejects.toThrow(
      /writer or an admin/,
    );
    await tutorRepo(h.db, editorB).reopenRequest(requestId);
    expect(await requestRow(requestId)).toEqual({ status: "open", sentenceId: null });
    const [gone] = await h.db
      .select({ id: schema.sentences.id })
      .from(schema.sentences)
      .where(eq(schema.sentences.id, sentenceId));
    expect(gone).toBeUndefined();
  });

  it("refuses while the sentence has a take or is no longer a draft", async () => {
    const { requestId, sentenceId } = await writtenRequest();
    const tutor = editorRepo(h.db, editorB, { morph: yesMorph });
    const takeId = await tutor.createAudioAsset(take("sentence", sentenceId));
    await expect(tutorRepo(h.db, admin).reopenRequest(requestId)).rejects.toThrow(/recording/);
    await tutor.discardAudio(takeId);

    await tutor.transitionEntity({ kind: "sentence", id: sentenceId, to: "in_review" });
    await expect(tutorRepo(h.db, editorB).reopenRequest(requestId)).rejects.toThrow(/draft/);
    expect((await requestRow(requestId))?.status).toBe("fulfilled");
  });
});
