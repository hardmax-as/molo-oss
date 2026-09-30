/**
 * The sentence publish gate against Postgres (ARCHITECTURE section 7): a
 * sentence assembled from lexemes publishes only when every token's lexeme
 * is published, every surface form is xh-morph verified or marked irregular
 * with a note, both glosses exist and tier-1/2 audio is published. And the
 * learner repo never returns a draft sentence, whatever its parts look like.
 */

import { schema } from "@molo/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SPEAKER_ID } from "../src/fixtures.ts";
import {
  LICENCE,
  SOURCE,
  completeLexeme,
  editorA,
  editorB,
  editorRepo,
  harness,
  learnerRepo,
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

async function publishLexeme(lemma: string): Promise<string> {
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

/** A sentence with glosses in both languages and published tier-1 audio; tokens are the caller's. */
async function sentenceWithParts(
  tokens: readonly {
    lexemeId: string;
    surfaceForm: string;
    morphVerified: boolean;
    irregular?: boolean;
    irregularNote?: string | null;
  }[],
): Promise<string> {
  const repo = editorRepo(h.db, editorA, { morph: yesMorph });
  // Distinct text per call: sentences_text_source_uq makes the same text from
  // the same source one row, which is the point of the constraint.
  const id = await repo.createSentence(
    {
      textXh: `zz-sentence-${crypto.randomUUID().slice(0, 8)}`,
      source: SOURCE,
      licence: LICENCE,
      origin: "human",
    },
    tokens.map((t, position) => ({ position, ...t })),
  );
  await repo.upsertSentenceGloss(id, { sourceLang: "en", gloss: "fixture en", origin: "human" });
  await repo.upsertSentenceGloss(id, { sourceLang: "nb", gloss: "fixture nb", origin: "human" });
  const audioId = await repo.createAudioAsset({
    targetKind: "sentence",
    targetId: id,
    speakerId: FIXTURE_SPEAKER_ID,
    tier: "1_native_studio",
    r2Key: `audio/${"b".repeat(64)}.opus`,
    sha256: "b".repeat(64),
    durationMs: 1500,
    lufs: -16,
    peakDbfs: -1.5,
    codec: "opus",
    sampleRate: 48_000,
    licence: "proprietary-molo",
  });
  const a = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
    kind: "audio_asset",
    id: audioId,
    to: "published",
  });
  if (!a.ok) throw new Error(a.reason);
  return id;
}

async function tryPublish(id: string) {
  await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
    kind: "sentence",
    id,
    to: "in_review",
  });
  return editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
    kind: "sentence",
    id,
    to: "published",
  });
}

describe("sentence publish gate", () => {
  it("blocks a sentence whose token references an unpublished lexeme", async () => {
    const draftLexeme = await completeLexeme(h.db, { creator: editorA, lemma: "zz-draft-lex" });
    const id = await sentenceWithParts([
      { lexemeId: draftLexeme, surfaceForm: "zz-draft-lex", morphVerified: true },
    ]);
    const gate = await editorRepo(h.db, editorB, { morph: yesMorph }).publishCheck("sentence", id);
    expect(gate.ok).toBe(false);
    expect(gate.failures.map((f) => f.code)).toContain("lexeme_not_published");
    const r = await tryPublish(id);
    expect(r.ok).toBe(false);
    const [row] = await h.db
      .select({ status: schema.sentences.status })
      .from(schema.sentences)
      .where(eq(schema.sentences.id, id));
    expect(row?.status).toBe("in_review");
  });

  it("blocks an unverified surface form unless it is marked irregular with a note", async () => {
    const lx = await publishLexeme("zz-lex");
    const unverified = await sentenceWithParts([
      { lexemeId: lx, surfaceForm: "zz-lexes", morphVerified: false },
    ]);
    const gate = await editorRepo(h.db, editorB, { morph: yesMorph }).publishCheck(
      "sentence",
      unverified,
    );
    expect(gate.ok).toBe(false);
    expect(gate.failures).toContainEqual({ code: "surface_form_unverified", detail: lx });

    // An irregular flag without a note is not an escape hatch.
    const noNote = await sentenceWithParts([
      { lexemeId: lx, surfaceForm: "zz-lexes", morphVerified: false, irregular: true },
    ]);
    expect(
      (
        await editorRepo(h.db, editorB, { morph: yesMorph }).publishCheck("sentence", noNote)
      ).failures.map((f) => f.code),
    ).toContain("surface_form_unverified");

    // Irregular with a human note passes.
    const noted = await sentenceWithParts([
      {
        lexemeId: lx,
        surfaceForm: "zz-lexes",
        morphVerified: false,
        irregular: true,
        irregularNote: "locative form confirmed by tutor",
      },
    ]);
    expect(
      (await editorRepo(h.db, editorB, { morph: yesMorph }).publishCheck("sentence", noted)).ok,
    ).toBe(true);
  });

  it("publishes when tokens are verified, glosses exist and audio is published; learners then see it", async () => {
    const a = await publishLexeme("zz-a");
    const b = await publishLexeme("zz-b");
    const id = await sentenceWithParts([
      { lexemeId: a, surfaceForm: "zz-a", morphVerified: true },
      { lexemeId: b, surfaceForm: "zz-b", morphVerified: true },
    ]);
    const r = await tryPublish(id);
    expect(r.ok).toBe(true);
    const seen = await learnerRepo(h.db).getSentences([id], "nb");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.gloss?.gloss).toBe("fixture nb");
    expect(seen[0]?.tokens.map((t) => t.surfaceForm)).toEqual(["zz-a", "zz-b"]);
    expect(seen[0]?.audio).not.toBeNull();
  });

  it("never returns a draft sentence to learners, even with published parts", async () => {
    const a = await publishLexeme("zz-a");
    const id = await sentenceWithParts([{ lexemeId: a, surfaceForm: "zz-a", morphVerified: true }]);
    expect(await learnerRepo(h.db).getSentences([id], "en")).toEqual([]);
    await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
      kind: "sentence",
      id,
      to: "in_review",
    });
    expect(await learnerRepo(h.db).getSentences([id], "en")).toEqual([]);
  });

  it("replacing tokens records a revision and rejects an unknown sentence", async () => {
    const a = await publishLexeme("zz-a");
    const repo = editorRepo(h.db, editorA, { morph: yesMorph });
    const id = await repo.createSentence({
      textXh: "zz-s",
      source: SOURCE,
      licence: LICENCE,
      origin: "human",
    });
    await repo.setSentenceTokens(id, [
      { position: 0, lexemeId: a, surfaceForm: "zz-a", morphVerified: true },
    ]);
    const revs = await h.db
      .select()
      .from(schema.contentRevisions)
      .where(eq(schema.contentRevisions.entityId, id));
    expect(revs.some((r) => "tokens" in (r.diff as object))).toBe(true);
    await expect(
      repo.setSentenceTokens("00000000-0000-4000-8000-00000000dead", []),
    ).rejects.toThrow(/not_found|sentence/);
  });
});
