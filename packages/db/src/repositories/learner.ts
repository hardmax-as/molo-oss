/**
 * Learner-facing reads. Every query appends `status = 'published'`
 * unconditionally. There is no parameter that widens it and there must
 * never be one (the project rules, first section). `test:integrity` seeds
 * unpublished rows and asserts none of these functions return them.
 *
 * Curriculum reads take the learner's enrolled `courseId` (ARCHITECTURE
 * section 2.6). It is a required argument rather than an optional filter so
 * that a caller cannot forget it and serve another course's units by
 * accident; `test:integrity` seeds a second course and asserts it stays
 * invisible.
 */

import type {
  AudioTier,
  CefrBand,
  ExercisePayloadEncoded,
  ExerciseType,
  Register,
  SkillKind,
  SourceLang,
} from "@molo/core";
import {
  CLICK_SOUNDS,
  PUBLISHABLE_TIERS,
  decodeExercisePayload,
  taughtLexemeIds,
} from "@molo/core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { Either } from "effect";

import type { Db } from "../client.ts";
import { audioAssets } from "../schema/audio.ts";
import { exercises, lessons, skills, units } from "../schema/curriculum.ts";
import { xpEvents } from "../schema/learners.ts";
import {
  glosses,
  lexemes,
  sentenceGlosses,
  sentenceLexemes,
  sentences,
} from "../schema/lexicon.ts";
import { nounClasses, speakers } from "../schema/reference.ts";

const PUBLISHED = "published" as const;

export interface PublishedUnitSummary {
  readonly id: string;
  readonly slug: string;
  readonly titleKey: string;
  readonly order: number;
  readonly cefrBand: CefrBand;
  readonly prerequisiteUnitId: string | null;
}

/** A unit's published lessons and the lexemes its published exercises teach, for the prerequisite rule. */
export interface UnitContentIndex {
  readonly unitId: string;
  readonly lessonIds: readonly string[];
  readonly lexemeIds: readonly string[];
}

export interface PublishedExercise {
  readonly id: string;
  readonly order: number;
  readonly type: ExerciseType;
  readonly payload: ExercisePayloadEncoded;
  readonly lexemeIds: readonly string[];
  readonly sentenceIds: readonly string[];
  readonly audioAssetIds: readonly string[];
  /**
   * The published lexemes this exercise *teaches*: its own subject words
   * plus the words of any sentence it uses. Distractors are not in here —
   * a gloss you rejected is not a word you met. The "new word" and "tricky"
   * badges are derived from this set, on the server for a signed-in learner
   * and on the device for a guest.
   */
  readonly teaches: readonly string[];
}

export interface PublishedLesson {
  readonly id: string;
  readonly order: number;
  readonly estimatedMinutes: number;
  readonly exercises: readonly PublishedExercise[];
}

export interface PublishedSkill {
  readonly id: string;
  readonly slug: string;
  readonly titleKey: string;
  readonly order: number;
  readonly kind: SkillKind;
  readonly lessons: readonly PublishedLesson[];
}

export interface PublishedUnit extends PublishedUnitSummary {
  readonly skills: readonly PublishedSkill[];
}

export interface PublishedAudio {
  readonly id: string;
  readonly r2Key: string;
  readonly tier: AudioTier;
  readonly durationMs: number;
  readonly speakerId: string | null;
  readonly licence: string;
  readonly speaker: {
    readonly id: string;
    readonly displayName: string;
    readonly gender: string | null;
    readonly ageGroup: "child" | "teen" | "adult" | "elder" | null;
  } | null;
}

/**
 * Orders a word's published voices: publishable tier first (studio before
 * Forvo), then the learner's preference (a speaker id, "female", "male" or
 * "child"), then the newest. "any" keeps the tier order.
 */
export function orderVoices(rows: readonly PublishedAudio[], preferred = "any"): PublishedAudio[] {
  const rank = (t: AudioTier) => PUBLISHABLE_TIERS.indexOf(t);
  const wants = (a: PublishedAudio): number => {
    if (preferred === "any" || !a.speaker) return 0;
    if (preferred === a.speaker.id) return 2;
    if (preferred === "female" || preferred === "male")
      return a.speaker.gender === preferred ? 1 : 0;
    if (preferred === "child") return a.speaker.ageGroup === "child" ? 1 : 0;
    return 0;
  };
  return rows
    .filter((r) => rank(r.tier) >= 0) // never tier 3, even if published by mistake
    .sort((a, b) => wants(b) - wants(a) || rank(a.tier) - rank(b.tier));
}

export interface PublishedLexeme {
  readonly id: string;
  readonly lemma: string;
  readonly pos: string;
  readonly nounClass: string | null;
  readonly isPlural: boolean;
  readonly infinitive: string | null;
  readonly register: Register;
  readonly cefrBand: CefrBand | null;
  readonly frequencyRank: number | null;
  readonly licence: string;
  readonly attribution: readonly string[];
  /** The gloss in the learner's source language. Null only if the gate was bypassed, which the integrity suite forbids. */
  readonly gloss: {
    readonly gloss: string;
    readonly usageNote: string | null;
    readonly contrastiveNote: string | null;
  } | null;
  /** The voice to play first: tier 1 before tier 2, then the learner's preference. Never tier 3. */
  readonly audio: PublishedAudio | null;
  /** Every published voice, the chosen one first. */
  readonly voices: readonly PublishedAudio[];
}

export interface PublishedSentence {
  readonly id: string;
  readonly textXh: string;
  readonly register: Register;
  readonly cefrBand: CefrBand | null;
  readonly gloss: { readonly gloss: string; readonly literalGloss: string | null } | null;
  readonly tokens: ReadonlyArray<{
    readonly position: number;
    readonly lexemeId: string;
    readonly surfaceForm: string;
  }>;
  readonly audio: PublishedAudio | null;
  readonly voices: readonly PublishedAudio[];
}

function groupVoices(
  rows: ReadonlyArray<PublishedAudio & { targetId: string }>,
  preferred: string,
): Map<string, PublishedAudio[]> {
  const byTarget = new Map<string, PublishedAudio[]>();
  for (const r of rows) {
    const list = byTarget.get(r.targetId) ?? [];
    list.push(r);
    byTarget.set(r.targetId, list);
  }
  for (const [k, list] of byTarget) byTarget.set(k, orderVoices(list, preferred));
  return byTarget;
}

/** One exercise row, as much of it as the "teaches" rule needs. */
interface TeachingRow {
  readonly id: string;
  readonly payload: ExercisePayloadEncoded;
  readonly sentenceIds: readonly string[];
}

export function learnerRepo(db: Db) {
  /**
   * The published lexemes each exercise teaches. The payload gives the
   * subject words; a sentence-based exercise teaches the sentence's own
   * tokens, which only this layer can see. Everything is filtered back
   * through `lexemes.status = 'published'`, so a word pulled into review
   * stops being called new or tricky the moment it leaves.
   */
  async function teachesFor(rows: readonly TeachingRow[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (rows.length === 0) return out;

    const sentenceIds = [...new Set(rows.flatMap((r) => [...r.sentenceIds]))];
    const tokenRows =
      sentenceIds.length === 0
        ? []
        : await db
            .select({ sentenceId: sentenceLexemes.sentenceId, lexemeId: sentenceLexemes.lexemeId })
            .from(sentenceLexemes)
            .innerJoin(sentences, eq(sentences.id, sentenceLexemes.sentenceId))
            .where(
              and(
                inArray(sentenceLexemes.sentenceId, sentenceIds),
                eq(sentences.status, PUBLISHED),
              ),
            );
    const bySentence = new Map<string, string[]>();
    for (const r of tokenRows)
      bySentence.set(r.sentenceId, [...(bySentence.get(r.sentenceId) ?? []), r.lexemeId]);

    const candidates = new Map<string, string[]>();
    for (const row of rows) {
      const decoded = decodeExercisePayload(row.payload);
      const own = Either.isRight(decoded) ? taughtLexemeIds(decoded.right) : [];
      const fromSentences = row.sentenceIds.flatMap((s) => bySentence.get(s) ?? []);
      candidates.set(row.id, [...new Set([...own, ...fromSentences])]);
    }

    const all = [...new Set([...candidates.values()].flat())];
    if (all.length === 0) {
      for (const [id] of candidates) out.set(id, []);
      return out;
    }
    const publishedRows = await db
      .select({ id: lexemes.id })
      .from(lexemes)
      .where(and(inArray(lexemes.id, all), eq(lexemes.status, PUBLISHED)));
    const published = new Set(publishedRows.map((r) => r.id));
    for (const [id, ids] of candidates)
      out.set(
        id,
        ids.filter((x) => published.has(x)),
      );
    return out;
  }

  async function publishedAudioFor(
    kind: "lexeme" | "sentence",
    ids: readonly string[],
    preferred = "any",
  ) {
    if (ids.length === 0) return new Map<string, PublishedAudio[]>();
    const rows = await db
      .select({
        id: audioAssets.id,
        r2Key: audioAssets.r2Key,
        tier: audioAssets.tier,
        durationMs: audioAssets.durationMs,
        speakerId: audioAssets.speakerId,
        licence: audioAssets.licence,
        targetId: audioAssets.targetId,
        speakerName: speakers.displayName,
        speakerGender: speakers.gender,
        speakerAge: speakers.ageGroup,
      })
      .from(audioAssets)
      .leftJoin(speakers, eq(speakers.id, audioAssets.speakerId))
      .where(
        and(
          eq(audioAssets.status, PUBLISHED),
          eq(audioAssets.targetKind, kind),
          inArray(audioAssets.targetId, [...ids]),
          inArray(audioAssets.tier, [...PUBLISHABLE_TIERS]),
        ),
      );
    return groupVoices(
      rows.map((r) => ({
        id: r.id,
        r2Key: r.r2Key,
        tier: r.tier,
        durationMs: r.durationMs,
        speakerId: r.speakerId,
        licence: r.licence,
        targetId: r.targetId,
        speaker:
          r.speakerId && r.speakerName
            ? {
                id: r.speakerId,
                displayName: r.speakerName,
                gender: r.speakerGender,
                ageGroup: r.speakerAge,
              }
            : null,
      })),
      preferred,
    );
  }

  return {
    async listUnits(courseId: string): Promise<PublishedUnitSummary[]> {
      return db
        .select({
          id: units.id,
          slug: units.slug,
          titleKey: units.titleKey,
          order: units.order,
          cefrBand: units.cefrBand,
          prerequisiteUnitId: units.prerequisiteUnitId,
        })
        .from(units)
        .where(and(eq(units.status, PUBLISHED), eq(units.courseId, courseId)))
        .orderBy(asc(units.order));
    },

    /**
     * Every published unit's published lessons and the lexemes its published
     * exercises reference. One query; the prerequisite rule and the guest
     * lesson count both read it.
     */
    async unitContentIndex(courseId: string): Promise<UnitContentIndex[]> {
      const rows = await db
        .select({
          unitId: units.id,
          lessonId: lessons.id,
          lexemeIds: exercises.lexemeIds,
        })
        .from(units)
        .innerJoin(skills, and(eq(skills.unitId, units.id), eq(skills.status, PUBLISHED)))
        .innerJoin(lessons, and(eq(lessons.skillId, skills.id), eq(lessons.status, PUBLISHED)))
        .leftJoin(
          exercises,
          and(eq(exercises.lessonId, lessons.id), eq(exercises.status, PUBLISHED)),
        )
        .where(and(eq(units.status, PUBLISHED), eq(units.courseId, courseId)));
      const byUnit = new Map<string, { lessons: Set<string>; lexemes: Set<string> }>();
      for (const r of rows) {
        const entry = byUnit.get(r.unitId) ?? { lessons: new Set(), lexemes: new Set() };
        entry.lessons.add(r.lessonId);
        for (const id of r.lexemeIds ?? []) entry.lexemes.add(id);
        byUnit.set(r.unitId, entry);
      }
      return [...byUnit].map(([unitId, e]) => ({
        unitId,
        lessonIds: [...e.lessons],
        lexemeIds: [...e.lexemes],
      }));
    },

    async getUnitBySlug(slug: string, courseId: string): Promise<PublishedUnit | null> {
      const [unit] = await db
        .select({
          id: units.id,
          slug: units.slug,
          titleKey: units.titleKey,
          order: units.order,
          cefrBand: units.cefrBand,
          prerequisiteUnitId: units.prerequisiteUnitId,
        })
        .from(units)
        .where(and(eq(units.slug, slug), eq(units.status, PUBLISHED), eq(units.courseId, courseId)))
        .limit(1);
      if (!unit) return null;

      const skillRows = await db
        .select({
          id: skills.id,
          slug: skills.slug,
          titleKey: skills.titleKey,
          order: skills.order,
          kind: skills.kind,
        })
        .from(skills)
        .where(and(eq(skills.unitId, unit.id), eq(skills.status, PUBLISHED)))
        .orderBy(asc(skills.order));
      const skillIds = skillRows.map((s) => s.id);

      const lessonRows =
        skillIds.length === 0
          ? []
          : await db
              .select({
                id: lessons.id,
                skillId: lessons.skillId,
                order: lessons.order,
                estimatedMinutes: lessons.estimatedMinutes,
              })
              .from(lessons)
              .where(and(inArray(lessons.skillId, skillIds), eq(lessons.status, PUBLISHED)))
              .orderBy(asc(lessons.order));
      const lessonIds = lessonRows.map((l) => l.id);

      const exerciseRows =
        lessonIds.length === 0
          ? []
          : await db
              .select({
                id: exercises.id,
                lessonId: exercises.lessonId,
                order: exercises.order,
                type: exercises.type,
                payload: exercises.payload,
                lexemeIds: exercises.lexemeIds,
                sentenceIds: exercises.sentenceIds,
                audioAssetIds: exercises.audioAssetIds,
              })
              .from(exercises)
              .where(and(inArray(exercises.lessonId, lessonIds), eq(exercises.status, PUBLISHED)))
              .orderBy(asc(exercises.order));
      const teaches = await teachesFor(exerciseRows);

      return {
        ...unit,
        skills: skillRows.map((s) => ({
          ...s,
          lessons: lessonRows
            .filter((l) => l.skillId === s.id)
            .map((l) => ({
              id: l.id,
              order: l.order,
              estimatedMinutes: l.estimatedMinutes,
              exercises: exerciseRows
                .filter((e) => e.lessonId === l.id)
                .map(({ lessonId: _lessonId, ...e }) => ({
                  ...e,
                  teaches: teaches.get(e.id) ?? [],
                })),
            })),
        })),
      };
    },

    /**
     * Words this learner has already met: everything taught by a published
     * exercise in a lesson they have finished (`xp_events`, the same record
     * the prerequisite rule reads). Anything outside this set is new to
     * them, which is exactly what the "new word" badge says.
     */
    async seenLexemeIds(userId: string): Promise<Set<string>> {
      const rows = await db
        .select({
          id: exercises.id,
          payload: exercises.payload,
          sentenceIds: exercises.sentenceIds,
        })
        .from(exercises)
        .innerJoin(lessons, and(eq(lessons.id, exercises.lessonId), eq(lessons.status, PUBLISHED)))
        .innerJoin(
          xpEvents,
          and(
            eq(xpEvents.refId, lessons.id),
            eq(xpEvents.refKind, "lesson"),
            eq(xpEvents.userId, userId),
          ),
        )
        .where(eq(exercises.status, PUBLISHED));
      const teaches = await teachesFor(rows);
      return new Set([...teaches.values()].flat());
    },

    /**
     * The bare-click recordings a learner may hear (onboarding's "Meet the
     * clicks"): `published` tier-1 studio takes of a `CLICK_SOUNDS` id, one
     * per click, newest first. Drafts, takes in review and every other tier
     * never appear; a click with no published take is simply absent, and the
     * client then offers no play button at all (never a TTS stand-in).
     */
    async publishedClickAudio(
      /** Only these `CLICK_SOUNDS` ids; every click when omitted. */
      only?: readonly string[],
    ): Promise<{ clickId: string; audio: PublishedAudio }[]> {
      const wanted = CLICK_SOUNDS.map((c) => c.id).filter((id) => !only || only.includes(id));
      if (wanted.length === 0) return [];
      const rows = await db
        .select({
          id: audioAssets.id,
          r2Key: audioAssets.r2Key,
          tier: audioAssets.tier,
          durationMs: audioAssets.durationMs,
          speakerId: audioAssets.speakerId,
          licence: audioAssets.licence,
          targetId: audioAssets.targetId,
          speakerName: speakers.displayName,
          speakerGender: speakers.gender,
          speakerAge: speakers.ageGroup,
        })
        .from(audioAssets)
        .leftJoin(speakers, eq(speakers.id, audioAssets.speakerId))
        .where(
          and(
            eq(audioAssets.status, PUBLISHED),
            eq(audioAssets.targetKind, "click"),
            eq(audioAssets.tier, "1_native_studio"),
            inArray(audioAssets.targetId, wanted),
          ),
        )
        .orderBy(desc(audioAssets.createdAt));
      const seen = new Set<string>();
      const out: { clickId: string; audio: PublishedAudio }[] = [];
      for (const r of rows) {
        if (seen.has(r.targetId)) continue;
        seen.add(r.targetId);
        out.push({
          clickId: r.targetId,
          audio: {
            id: r.id,
            r2Key: r.r2Key,
            tier: r.tier,
            durationMs: r.durationMs,
            speakerId: r.speakerId,
            licence: r.licence,
            speaker:
              r.speakerId && r.speakerName
                ? {
                    id: r.speakerId,
                    displayName: r.speakerName,
                    gender: r.speakerGender,
                    ageGroup: r.speakerAge,
                  }
                : null,
          },
        });
      }
      return out;
    },

    async getLexemes(
      ids: readonly string[],
      sourceLang: SourceLang,
      preferredVoice = "any",
    ): Promise<PublishedLexeme[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .select({
          id: lexemes.id,
          lemma: lexemes.lemma,
          pos: lexemes.pos,
          nounClass: nounClasses.label,
          isPlural: lexemes.isPlural,
          infinitive: lexemes.infinitive,
          register: lexemes.register,
          cefrBand: lexemes.cefrBand,
          frequencyRank: lexemes.frequencyRank,
          licence: lexemes.licence,
          attribution: lexemes.attribution,
        })
        .from(lexemes)
        .leftJoin(nounClasses, eq(lexemes.nounClassId, nounClasses.id))
        .where(and(inArray(lexemes.id, [...ids]), eq(lexemes.status, PUBLISHED)));
      const found = rows.map((r) => r.id);
      if (found.length === 0) return [];

      const glossRows = await db
        .select({
          lexemeId: glosses.lexemeId,
          gloss: glosses.gloss,
          usageNote: glosses.usageNote,
          contrastiveNote: glosses.contrastiveNote,
        })
        .from(glosses)
        .where(
          and(
            inArray(glosses.lexemeId, found),
            eq(glosses.sourceLang, sourceLang),
            eq(glosses.status, PUBLISHED),
          ),
        );
      const glossBy = new Map(glossRows.map((g) => [g.lexemeId, g]));
      const audioBy = await publishedAudioFor("lexeme", found, preferredVoice);

      return rows.map((r) => {
        const g = glossBy.get(r.id);
        return {
          ...r,
          gloss: g
            ? { gloss: g.gloss, usageNote: g.usageNote, contrastiveNote: g.contrastiveNote }
            : null,
          audio: audioBy.get(r.id)?.[0] ?? null,
          voices: audioBy.get(r.id) ?? [],
        };
      });
    },

    async getSentences(
      ids: readonly string[],
      sourceLang: SourceLang,
      preferredVoice = "any",
    ): Promise<PublishedSentence[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .select({
          id: sentences.id,
          textXh: sentences.textXh,
          register: sentences.register,
          cefrBand: sentences.cefrBand,
        })
        .from(sentences)
        .where(and(inArray(sentences.id, [...ids]), eq(sentences.status, PUBLISHED)));
      const found = rows.map((r) => r.id);
      if (found.length === 0) return [];

      const glossRows = await db
        .select({
          sentenceId: sentenceGlosses.sentenceId,
          gloss: sentenceGlosses.gloss,
          literalGloss: sentenceGlosses.literalGloss,
        })
        .from(sentenceGlosses)
        .where(
          and(
            inArray(sentenceGlosses.sentenceId, found),
            eq(sentenceGlosses.sourceLang, sourceLang),
            eq(sentenceGlosses.status, PUBLISHED),
          ),
        );
      const glossBy = new Map(glossRows.map((g) => [g.sentenceId, g]));
      const tokenRows = await db
        .select({
          sentenceId: sentenceLexemes.sentenceId,
          position: sentenceLexemes.position,
          lexemeId: sentenceLexemes.lexemeId,
          surfaceForm: sentenceLexemes.surfaceForm,
        })
        .from(sentenceLexemes)
        .where(inArray(sentenceLexemes.sentenceId, found))
        .orderBy(asc(sentenceLexemes.position));
      const audioBy = await publishedAudioFor("sentence", found, preferredVoice);

      return rows.map((r) => {
        const g = glossBy.get(r.id);
        return {
          ...r,
          gloss: g ? { gloss: g.gloss, literalGloss: g.literalGloss } : null,
          tokens: tokenRows
            .filter((t) => t.sentenceId === r.id)
            .map(({ sentenceId: _s, ...t }) => t),
          audio: audioBy.get(r.id)?.[0] ?? null,
          voices: audioBy.get(r.id) ?? [],
        };
      });
    },

    /** Published tier-1/2 audio for explicit asset ids (click drills reference assets directly). */
    async getAudioAssets(ids: readonly string[]): Promise<PublishedAudio[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .select({
          id: audioAssets.id,
          r2Key: audioAssets.r2Key,
          tier: audioAssets.tier,
          durationMs: audioAssets.durationMs,
          speakerId: audioAssets.speakerId,
          licence: audioAssets.licence,
          speakerName: speakers.displayName,
          speakerGender: speakers.gender,
          speakerAge: speakers.ageGroup,
        })
        .from(audioAssets)
        .leftJoin(speakers, eq(speakers.id, audioAssets.speakerId))
        .where(
          and(
            inArray(audioAssets.id, [...ids]),
            eq(audioAssets.status, PUBLISHED),
            inArray(audioAssets.tier, [...PUBLISHABLE_TIERS]),
          ),
        );
      return rows.map((r) => ({
        id: r.id,
        r2Key: r.r2Key,
        tier: r.tier,
        durationMs: r.durationMs,
        speakerId: r.speakerId,
        licence: r.licence,
        speaker:
          r.speakerId && r.speakerName
            ? {
                id: r.speakerId,
                displayName: r.speakerName,
                gender: r.speakerGender,
                ageGroup: r.speakerAge,
              }
            : null,
      }));
    },
  };
}

export type LearnerRepo = ReturnType<typeof learnerRepo>;
