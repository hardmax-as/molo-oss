/** Editorial reads only. No learner repository is called or widened here. */
import { decodeExercisePayload, referencedClickIds, type Actor, type SourceLang } from "@molo/core";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { Either } from "effect";

import type { Db } from "../client.ts";
import { audioAssets } from "../schema/audio.ts";
import { exercises, lessons, skills, units } from "../schema/curriculum.ts";
import {
  glosses,
  lexemes,
  sentenceGlosses,
  sentenceLexemes,
  sentences,
} from "../schema/lexicon.ts";
import { nounClasses, speakers } from "../schema/reference.ts";
import { assertEditorial } from "./roles.ts";

const VISIBLE = ["draft", "ai_draft", "in_review", "published"] as const;

export function editorPreviewRepo(db: Db, actor: Actor) {
  assertEditorial(actor);

  async function tree(courseId: string, slug?: string) {
    assertEditorial(actor);
    const unitRows = await db
      .select()
      .from(units)
      .where(
        and(
          eq(units.courseId, courseId),
          inArray(units.status, VISIBLE),
          slug === undefined ? undefined : eq(units.slug, slug),
        ),
      )
      .orderBy(asc(units.order));
    const skillRows = await db
      .select()
      .from(skills)
      .where(
        and(
          inArray(
            skills.unitId,
            unitRows.map((u) => u.id),
          ),
          inArray(skills.status, VISIBLE),
        ),
      )
      .orderBy(asc(skills.order));
    const lessonRows = await db
      .select()
      .from(lessons)
      .where(
        and(
          inArray(
            lessons.skillId,
            skillRows.map((s) => s.id),
          ),
          inArray(lessons.status, VISIBLE),
        ),
      )
      .orderBy(asc(lessons.order));
    return unitRows.map((unit) => ({
      ...unit,
      locked: false,
      prerequisiteSlug: null,
      prerequisiteTitleKey: null,
      lessonCount: lessonRows.filter((l) =>
        skillRows.some((s) => s.unitId === unit.id && s.id === l.skillId),
      ).length,
      skills: skillRows
        .filter((s) => s.unitId === unit.id)
        .map((skill) => ({
          ...skill,
          grammarNotes: [],
          lessons: lessonRows
            .filter((l) => l.skillId === skill.id)
            .map((lesson) => ({ ...lesson, exercises: [] })),
        })),
    }));
  }

  async function unitWithContent(slug: string, courseId: string, lang: SourceLang) {
    assertEditorial(actor);
    const [unit] = await tree(courseId, slug);
    if (!unit) return null;
    const lessonIds = unit.skills.flatMap((s) => s.lessons.map((l) => l.id));
    const exerciseRows = await db
      .select()
      .from(exercises)
      .where(and(inArray(exercises.lessonId, lessonIds), inArray(exercises.status, VISIBLE)))
      .orderBy(asc(exercises.order));
    const sentenceIds = [...new Set(exerciseRows.flatMap((e) => e.sentenceIds))];
    const sentenceRows = await db
      .select()
      .from(sentences)
      .where(and(inArray(sentences.id, sentenceIds), inArray(sentences.status, VISIBLE)));
    const tokens = await db
      .select()
      .from(sentenceLexemes)
      .where(
        inArray(
          sentenceLexemes.sentenceId,
          sentenceRows.map((s) => s.id),
        ),
      )
      .orderBy(asc(sentenceLexemes.position));
    const lexemeIds = [
      ...new Set([...exerciseRows.flatMap((e) => e.lexemeIds), ...tokens.map((t) => t.lexemeId)]),
    ];
    const lexemeRows = await db
      .select({ row: lexemes, nounClass: nounClasses.label })
      .from(lexemes)
      .leftJoin(nounClasses, eq(nounClasses.id, lexemes.nounClassId))
      .where(and(inArray(lexemes.id, lexemeIds), inArray(lexemes.status, VISIBLE)));
    const glossRows = await db
      .select()
      .from(glosses)
      .where(
        and(
          inArray(
            glosses.lexemeId,
            lexemeRows.map((l) => l.row.id),
          ),
          eq(glosses.sourceLang, lang),
          inArray(glosses.status, VISIBLE),
        ),
      );
    const sentenceGlossRows = await db
      .select()
      .from(sentenceGlosses)
      .where(
        and(
          inArray(
            sentenceGlosses.sentenceId,
            sentenceRows.map((s) => s.id),
          ),
          eq(sentenceGlosses.sourceLang, lang),
          inArray(sentenceGlosses.status, VISIBLE),
        ),
      );
    // The bare clicks a click_identify plays: studio takes at any status but
    // retired, so an editor can hear a take before approving it.
    const clickIds = [
      ...new Set(
        exerciseRows.flatMap((e) => {
          const decoded = decodeExercisePayload(e.payload);
          return Either.isRight(decoded) ? referencedClickIds(decoded.right) : [];
        }),
      ),
    ];
    const audioRows = await db
      .select({
        asset: audioAssets,
        speaker: {
          id: speakers.id,
          displayName: speakers.displayName,
          gender: speakers.gender,
          ageGroup: speakers.ageGroup,
        },
      })
      .from(audioAssets)
      .leftJoin(speakers, eq(speakers.id, audioAssets.speakerId))
      .where(
        and(
          inArray(audioAssets.status, VISIBLE),
          or(
            and(
              eq(audioAssets.targetKind, "lexeme"),
              inArray(
                audioAssets.targetId,
                lexemeRows.map((l) => l.row.id),
              ),
            ),
            and(
              eq(audioAssets.targetKind, "sentence"),
              inArray(
                audioAssets.targetId,
                sentenceRows.map((s) => s.id),
              ),
            ),
            inArray(
              audioAssets.id,
              exerciseRows.flatMap((e) => e.audioAssetIds),
            ),
            and(
              eq(audioAssets.targetKind, "click"),
              eq(audioAssets.tier, "1_native_studio"),
              inArray(audioAssets.targetId, clickIds),
            ),
          ),
        ),
      )
      .orderBy(asc(audioAssets.tier), asc(audioAssets.createdAt));
    return {
      unit: {
        ...unit,
        skills: unit.skills.map((skill) => ({
          ...skill,
          lessons: skill.lessons.map((lesson) => ({
            ...lesson,
            exercises: exerciseRows
              .filter((e) => e.lessonId === lesson.id)
              .map((e) => ({ ...e, teaches: [], moment: null })),
          })),
        })),
      },
      lexemeRows,
      glossRows,
      sentenceRows,
      sentenceGlossRows,
      tokens,
      audioRows,
    };
  }
  return { tree, unit: unitWithContent };
}
