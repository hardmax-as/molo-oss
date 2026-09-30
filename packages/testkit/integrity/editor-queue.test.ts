/**
 * The editor landing page's numbers, held to the publish gate itself.
 *
 * The page aggregates in SQL what `transitionEntity` decides one row at a
 * time, which is a duplication worth having — a dashboard that asks the
 * gate 3 000 times is a dashboard nobody opens — but only while the two
 * agree. So this suite builds content with known defects, then compares the
 * aggregate against a histogram assembled from `publishCheck` row by row.
 * If a gate rule changes and `editor-queue.ts` does not, this fails.
 */

import type { GateBlockerCount } from "@molo/core";
import { contentReport } from "@molo/db";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_SPEAKER_ID } from "../src/fixtures.ts";
import {
  completeLexeme,
  editorA,
  editorB,
  editorRepo,
  harness,
  LICENCE,
  SOURCE,
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

const overview = () => contentReport(h.db, new Date(), { morph: yesMorph });

/** A bare lexeme: no gloss, no audio. Every optional defect is opt-in. */
async function bareLexeme(lemma: string, pos = "verb"): Promise<string> {
  return repoA().createLexeme({
    lemma,
    pos,
    nounClassLabel: pos === "noun" ? "13" : null,
    source: SOURCE,
    licence: LICENCE,
    origin: "human",
  });
}

async function publishedAudioFor(kind: "lexeme" | "sentence", id: string, seed: string) {
  const audioId = await repoA().createAudioAsset({
    targetKind: kind,
    targetId: id,
    speakerId: FIXTURE_SPEAKER_ID,
    tier: "1_native_studio",
    r2Key: `audio/${seed.repeat(64).slice(0, 64)}.opus`,
    sha256: seed.repeat(64).slice(0, 64),
    durationMs: 900,
    lufs: -16,
    peakDbfs: -1.5,
    codec: "opus",
    sampleRate: 48_000,
    licence: "proprietary-molo",
  });
  const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
    kind: "audio_asset",
    id: audioId,
    to: "published",
  });
  if (!r.ok) throw new Error(r.reason);
  return audioId;
}

/**
 * The verdict the gate itself gives, as the landing page counts it: one
 * entry per row per reason, with the two approval codes dropped because
 * they are facts about who is approving rather than about the row.
 */
async function gateHistogram(): Promise<GateBlockerCount[]> {
  const repo = editorRepo(h.db, editorB, { morph: yesMorph });
  const pending = (await h.db.execute(
    sql`select 'lexeme' as kind, id::text as id from lexemes
          where status in ('draft','ai_draft','in_review')
        union all
        select 'sentence' as kind, id::text as id from sentences
          where status in ('draft','ai_draft','in_review')`,
  )) as unknown as { kind: "lexeme" | "sentence"; id: string }[];

  const tally = new Map<string, GateBlockerCount>();
  for (const row of pending) {
    const result = await repo.publishCheck(row.kind, row.id);
    // One row counts once per reason, however many failures it earned: a
    // sentence with four unverified tokens is one row to open.
    const seen = new Set<string>();
    for (const f of result.failures) {
      if (f.code === "four_eyes" || f.code === "approver_not_editorial") continue;
      const detail = f.code === "gloss_missing" ? (f.detail ?? null) : null;
      const key = `${row.kind}:${f.code}:${detail ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = tally.get(key);
      tally.set(
        key,
        existing
          ? { ...existing, rows: existing.rows + 1 }
          : { kind: row.kind, code: f.code, detail, rows: 1 },
      );
    }
  }
  return [...tally.values()];
}

const sortGate = (g: readonly GateBlockerCount[]): GateBlockerCount[] =>
  [...g].sort((a, b) =>
    `${a.kind}:${a.code}:${a.detail ?? ""}`.localeCompare(`${b.kind}:${b.code}:${b.detail ?? ""}`),
  );

describe("the landing page's blockers match what the gate would refuse", () => {
  it("agrees with publishCheck, reason by reason, over a lexicon full of defects", async () => {
    const repo = repoA();
    // One word short of everything.
    await bareLexeme("zz-bare");
    // One with an English gloss only: `gloss_missing: nb` and nothing else
    // about glosses.
    const enOnly = await bareLexeme("zz-en-only");
    await repo.upsertGloss(enOnly, { sourceLang: "en", gloss: "en", origin: "human" });
    // One whose only Norwegian gloss is an AI draft, which the gate does not
    // accept and which the landing page must not accept either.
    const aiNb = await bareLexeme("zz-ai-nb");
    await repo.upsertGloss(aiNb, { sourceLang: "en", gloss: "en", origin: "human" });
    await repo.upsertGloss(aiNb, { sourceLang: "nb", gloss: "nb", origin: "llm" });
    // A noun in a class, with no plural link: the morphology question.
    await bareLexeme("zz-noun", "noun");
    // One with both glosses and published audio: nothing left but approval.
    const ready = await bareLexeme("zz-ready");
    await repo.upsertGloss(ready, { sourceLang: "en", gloss: "en", origin: "human" });
    await repo.upsertGloss(ready, { sourceLang: "nb", gloss: "nb", origin: "human" });
    await publishedAudioFor("lexeme", ready, "c");

    // A sentence whose tokens are unverified and whose word is not published.
    const word = await bareLexeme("zz-token");
    await repo.createSentence(
      { textXh: "zz-sentence-one", source: SOURCE, licence: LICENCE, origin: "human" },
      [{ position: 0, lexemeId: word, surfaceForm: "zz-token", morphVerified: false }],
    );

    const [report, expected] = await Promise.all([overview(), gateHistogram()]);
    expect(sortGate(report.blockers.gate)).toEqual(sortGate(expected));
    // And the reasons are the ones the fixture built, not an empty agreement.
    const codes = report.blockers.gate.map((g) => `${g.kind}:${g.code}:${g.detail ?? ""}`);
    expect(codes).toContain("lexeme:gloss_missing:nb");
    expect(codes).toContain("lexeme:audio_missing:");
    expect(codes).toContain("sentence:lexeme_not_published:");
    expect(codes).toContain("sentence:surface_form_unverified:");
  });

  it("counts an ai_draft gloss as missing, exactly as the gate does", async () => {
    const repo = repoA();
    const id = await bareLexeme("zz-ai-only");
    await repo.upsertGloss(id, { sourceLang: "en", gloss: "en", origin: "llm" });
    await repo.upsertGloss(id, { sourceLang: "nb", gloss: "nb", origin: "llm" });

    const report = await overview();
    expect(report.writing.lexemesMissingBothGlosses).toBe(1);
    const gate = report.blockers.gate.filter(
      (g) => g.kind === "lexeme" && g.code === "gloss_missing",
    );
    expect(gate.map((g) => g.detail).sort()).toEqual(["en", "nb"]);
    expect(sortGate(report.blockers.gate)).toEqual(sortGate(await gateHistogram()));
  });

  it("agrees when nothing is blocked", async () => {
    const report = await overview();
    expect(report.blockers.gate).toEqual([]);
    expect(report.blockers.gateConsidered).toEqual({ lexemes: 0, sentences: 0 });
  });
});

describe("the writing gaps", () => {
  it("names a skill whose lessons hold no sentence, and stops naming it once one does", async () => {
    const repo = repoA();
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

    const before = await overview();
    expect(before.writing.skillsWithoutSentencesTotal).toBe(1);
    expect(before.writing.skillsWithoutSentences[0]).toMatchObject({
      skillId,
      skillSlug: "zz-skill",
      unitSlug: "zz-unit",
      lessons: 1,
    });

    // A sentence reaches a skill only through an exercise of one of its
    // lessons; that is the only link the schema has.
    const word = await completeLexeme(h.db, { creator: editorA, lemma: "zz-w" });
    const sentenceId = await repo.createSentence(
      { textXh: "zz-sentence-two", source: SOURCE, licence: LICENCE, origin: "human" },
      [{ position: 0, lexemeId: word, surfaceForm: "zz-w", morphVerified: true }],
    );
    await repo.createExercise({
      lessonId,
      order: 1,
      type: "translate_tap",
      payload: { type: "translate_tap", sentenceId, distractorLexemeIds: [] },
    });

    const after = await overview();
    expect(after.writing.skillsWithoutSentencesTotal).toBe(0);
    expect(after.writing.skillsWithoutSentences).toEqual([]);
  });

  it("separates a missing Norwegian gloss from a word with neither", async () => {
    const repo = repoA();
    const enOnly = await bareLexeme("zz-g-en");
    await repo.upsertGloss(enOnly, { sourceLang: "en", gloss: "en", origin: "human" });
    const nbOnly = await bareLexeme("zz-g-nb");
    await repo.upsertGloss(nbOnly, { sourceLang: "nb", gloss: "nb", origin: "human" });
    await bareLexeme("zz-g-none");

    const w = (await overview()).writing;
    expect(w.lexemesMissingNbGloss).toBe(1);
    expect(w.lexemesMissingEnGloss).toBe(1);
    expect(w.lexemesMissingBothGlosses).toBe(1);
  });
});

describe("the recording gaps", () => {
  it("counts words with no native recording per unit, and drops them once recorded", async () => {
    const repo = repoA();
    const unitId = await repo.createUnit({
      slug: "zz-rec-unit",
      titleKey: "units.unit1.title",
      order: 1,
      cefrBand: "A1",
    });
    const skillId = await repo.createSkill({
      unitId,
      slug: "zz-rec-skill",
      titleKey: "units.unit1.title",
      order: 1,
      kind: "vocab",
    });
    const lessonId = await repo.createLesson({ skillId, order: 1 });
    const a = await bareLexeme("zz-rec-a");
    const b = await bareLexeme("zz-rec-b");
    await repo.createExercise({
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

    const before = (await overview()).recording;
    expect(before.byUnit).toEqual([
      { unitSlug: "zz-rec-unit", unitTitleKey: "units.unit1.title", missing: 2 },
    ]);
    expect(before.notInAnyUnit).toBe(0);

    await publishedAudioFor("lexeme", a, "d");
    const after = (await overview()).recording;
    expect(after.byUnit[0]?.missing).toBe(1);
  });

  it("a take waiting for approval already covers its word, and is its own figure", async () => {
    const repo = repoA();
    const id = await bareLexeme("zz-take");
    // Created, not published: the studio would not queue this word again,
    // but a second editor still has to approve the take.
    await repo.createAudioAsset({
      targetKind: "lexeme",
      targetId: id,
      speakerId: FIXTURE_SPEAKER_ID,
      tier: "1_native_studio",
      r2Key: `audio/${"e".repeat(64)}.opus`,
      sha256: "e".repeat(64),
      durationMs: 900,
      lufs: -16,
      peakDbfs: -1.5,
      codec: "opus",
      sampleRate: 48_000,
      licence: "proprietary-molo",
    });

    const rec = (await overview()).recording;
    expect(rec.notInAnyUnit).toBe(0);
    expect(rec.takesAwaitingApproval).toBe(1);
    // The gate still refuses the word, because the take is not published.
    const report = await overview();
    expect(
      report.blockers.gate.find((g) => g.kind === "lexeme" && g.code === "audio_missing")?.rows,
    ).toBe(1);
  });

  it("reports the speakers a session needs consent from", async () => {
    const rec = (await overview()).recording;
    expect(rec.speakersTotal).toBeGreaterThan(0);
    expect(rec.speakersWithConsent).toBe(rec.speakersTotal);
  });
});
