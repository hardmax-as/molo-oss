/**
 * Bare-click recordings: fifteen fixed targets from `CLICK_SOUNDS`, recorded
 * in the studio and reviewed like every other audio asset. A click has no row
 * of its own, so the repository is the only thing standing between a typo'd
 * id and an orphaned recording; and like all audio, a click take reaches
 * nobody until a second editor approves it.
 */

import { CLICK_SOUNDS } from "@molo/core";
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

const qh = CLICK_SOUNDS.find((c) => c.letter === "qh")!;

function clickTake(targetId: string, tier: "1_native_studio" | "3_tts" = "1_native_studio") {
  return {
    targetKind: "click" as const,
    targetId,
    speakerId: FIXTURE_SPEAKER_ID,
    tier,
    r2Key: `audio/${"c".repeat(64)}.opus`,
    sha256: "c".repeat(64),
    durationMs: 700,
    lufs: -16,
    peakDbfs: -1.5,
    codec: "opus",
    sampleRate: 48_000,
    licence: "proprietary-molo",
  };
}

describe("bare-click audio", () => {
  it("rejects a click id that is not one of the fifteen", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    await expect(
      repo.createAudioAsset(clickTake("00000000-0000-4000-8000-00000000c11c")),
    ).rejects.toThrow(/click/);
  });

  it("accepts only a studio recording (tier 1) for a click", async () => {
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    await expect(repo.createAudioAsset(clickTake(qh.id, "3_tts"))).rejects.toThrow(/tier 1/);
  });

  it("enters review, is labelled by its letter, and needs a second editor to publish", async () => {
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await author.createAudioAsset(clickTake(qh.id));

    expect(await statusOf(h.db, "audioAssets", id)).toBe("in_review");

    const queued = (await author.reviewQueue()).find((r) => r.entityId === id);
    expect(queued?.entityKind).toBe("audio_asset");
    expect(queued?.clickLetter).toBe("qh");

    const self = await author.transitionEntity({ kind: "audio_asset", id, to: "published" });
    expect(self.ok).toBe(false);

    const other = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
      kind: "audio_asset",
      id,
      to: "published",
    });
    expect(other.ok).toBe(true);
  });
});

describe("learners hear only published click recordings (GET /clicks)", () => {
  const byLetter = (letter: string) => CLICK_SOUNDS.find((c) => c.letter === letter)!;

  it("returns nothing while every take is still a draft or in review", async () => {
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    await author.createAudioAsset(clickTake(byLetter("c").id));
    const draft = await author.createAudioAsset(clickTake(byLetter("x").id));
    // Sabotage: force a take back to draft. The learner read must still skip it.
    await h.db
      .update(schema.audioAssets)
      .set({ status: "draft" })
      .where(eq(schema.audioAssets.id, draft));
    expect(await learnerRepo(h.db).publishedClickAudio()).toEqual([]);
  });

  it("returns a click once a second editor publishes it, and never the others", async () => {
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    const approver = editorRepo(h.db, editorB, { morph: yesMorph });
    const published = await author.createAudioAsset(clickTake(byLetter("q").id));
    const inReview = await author.createAudioAsset(clickTake(byLetter("c").id));
    const retired = await author.createAudioAsset(clickTake(byLetter("x").id));
    expect(
      await approver.transitionEntity({ kind: "audio_asset", id: published, to: "published" }),
    ).toMatchObject({ ok: true });
    await h.db
      .update(schema.audioAssets)
      .set({ status: "retired" })
      .where(eq(schema.audioAssets.id, retired));

    const heard = await learnerRepo(h.db).publishedClickAudio();
    expect(heard.map((r) => r.clickId)).toEqual([byLetter("q").id]);
    expect(heard[0]?.audio.id).toBe(published);
    expect(heard.map((r) => r.audio.id)).not.toContain(inReview);
    expect(await statusOf(h.db, "audioAssets", inReview)).toBe("in_review");
  });

  it("never serves a published tier-3 row for a click, even one forced in by hand", async () => {
    const author = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await author.createAudioAsset(clickTake(byLetter("q").id));
    await h.db
      .update(schema.audioAssets)
      .set({ status: "published", tier: "3_tts" })
      .where(eq(schema.audioAssets.id, id));
    expect(await learnerRepo(h.db).publishedClickAudio()).toEqual([]);
  });
});
