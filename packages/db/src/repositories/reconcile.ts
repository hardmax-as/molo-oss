/**
 * The reads `molo content reconcile-unit-1` plans from. Every status is
 * read, because the rows being reconciled are drafts; nothing here writes.
 * The writes go through `editorRepo` (moveExercise, moveGrammarNote,
 * createLesson, createExercise, updateExercise, deleteDraft), so each one is
 * role-checked and lands in `content_revisions`.
 */

import type { Status } from "@molo/core";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Db } from "../client.ts";
import { exercises, lessons, skills, units } from "../schema/curriculum.ts";
import { grammarNotes } from "../schema/grammar.ts";
import { glosses, lexemes, sentenceLexemes } from "../schema/lexicon.ts";
import { nounClasses } from "../schema/reference.ts";

export interface SnapshotExercise {
  readonly id: string;
  readonly order: number;
  readonly type: string;
  readonly status: Status;
  readonly payload: unknown;
}
export interface SnapshotLesson {
  readonly id: string;
  readonly order: number;
  readonly status: Status;
  readonly exercises: SnapshotExercise[];
}
export interface SnapshotSkill {
  readonly id: string;
  readonly slug: string;
  readonly status: Status;
  readonly lessons: SnapshotLesson[];
}
export interface SnapshotUnit {
  readonly id: string;
  readonly slug: string;
  readonly status: Status;
  readonly skills: SnapshotSkill[];
}

export interface UnitReconcileSnapshot {
  readonly oldUnit: SnapshotUnit | null;
  readonly newUnit: SnapshotUnit | null;
  readonly notes: {
    id: string;
    slug: string;
    status: Status;
    order: number;
    unitSlug: string;
    skillSlug: string;
  }[];
  readonly skillIds: Record<string, string>;
  readonly lexemes: Record<
    string,
    { id: string; lemma: string; nounClassLabel: string | null; glosses: string[] }
  >;
  readonly sentenceLexemes: Record<string, string[]>;
}

async function unitTree(db: Db, slug: string): Promise<SnapshotUnit | null> {
  const [unit] = await db
    .select({ id: units.id, slug: units.slug, status: units.status })
    .from(units)
    .where(eq(units.slug, slug))
    .limit(1);
  if (!unit) return null;
  const skillRows = await db
    .select({ id: skills.id, slug: skills.slug, status: skills.status, order: skills.order })
    .from(skills)
    .where(eq(skills.unitId, unit.id))
    .orderBy(asc(skills.order));
  const lessonRows =
    skillRows.length === 0
      ? []
      : await db
          .select({
            id: lessons.id,
            skillId: lessons.skillId,
            order: lessons.order,
            status: lessons.status,
          })
          .from(lessons)
          .where(
            inArray(
              lessons.skillId,
              skillRows.map((s) => s.id),
            ),
          )
          .orderBy(asc(lessons.order));
  const exerciseRows =
    lessonRows.length === 0
      ? []
      : await db
          .select({
            id: exercises.id,
            lessonId: exercises.lessonId,
            order: exercises.order,
            type: exercises.type,
            status: exercises.status,
            payload: exercises.payload,
          })
          .from(exercises)
          .where(
            inArray(
              exercises.lessonId,
              lessonRows.map((l) => l.id),
            ),
          )
          .orderBy(asc(exercises.order));
  return {
    ...unit,
    skills: skillRows.map((s) => ({
      id: s.id,
      slug: s.slug,
      status: s.status,
      lessons: lessonRows
        .filter((l) => l.skillId === s.id)
        .map((l) => ({
          id: l.id,
          order: l.order,
          status: l.status,
          exercises: exerciseRows
            .filter((e) => e.lessonId === l.id)
            .map((e) => ({
              id: e.id,
              order: e.order,
              type: e.type,
              status: e.status,
              payload: e.payload,
            })),
        })),
    })),
  };
}

/**
 * Both units in full, the grammar notes named by slug wherever they sit, the
 * skills they may move to, and every lexeme the exercises point at with its
 * English glosses (the relevance guard reads those and nothing else).
 */
export async function unitReconcileSnapshot(
  db: Db,
  input: {
    readonly oldUnitSlug: string;
    readonly newUnitSlug: string;
    readonly noteSlugs: readonly string[];
    /** `unit/skill` pairs a note may move to. */
    readonly noteTargets: readonly string[];
  },
): Promise<UnitReconcileSnapshot> {
  const [oldUnit, newUnit] = await Promise.all([
    unitTree(db, input.oldUnitSlug),
    unitTree(db, input.newUnitSlug),
  ]);

  const notes =
    input.noteSlugs.length === 0
      ? []
      : await db
          .select({
            id: grammarNotes.id,
            slug: grammarNotes.slug,
            status: grammarNotes.status,
            order: grammarNotes.order,
            unitSlug: units.slug,
            skillSlug: skills.slug,
          })
          .from(grammarNotes)
          .innerJoin(skills, eq(skills.id, grammarNotes.skillId))
          .innerJoin(units, eq(units.id, skills.unitId))
          .where(inArray(grammarNotes.slug, [...input.noteSlugs]));

  const skillIds: Record<string, string> = {};
  for (const target of new Set(input.noteTargets)) {
    const [unitSlug, skillSlug] = target.split("/");
    if (!unitSlug || !skillSlug) continue;
    const [row] = await db
      .select({ id: skills.id })
      .from(skills)
      .innerJoin(units, eq(units.id, skills.unitId))
      .where(and(eq(units.slug, unitSlug), eq(skills.slug, skillSlug)))
      .limit(1);
    if (row) skillIds[target] = row.id;
  }

  // Every lexeme the exercises name, plus the words of their sentences.
  const all = [oldUnit, newUnit].flatMap((u) =>
    (u?.skills ?? []).flatMap((s) => s.lessons.flatMap((l) => l.exercises)),
  );
  const ids =
    all.length === 0
      ? []
      : await db
          .select({ lexemeIds: exercises.lexemeIds, sentenceIds: exercises.sentenceIds })
          .from(exercises)
          .where(
            inArray(
              exercises.id,
              all.map((e) => e.id),
            ),
          );
  const sentenceIds = [...new Set(ids.flatMap((r) => r.sentenceIds))];
  const tokenRows =
    sentenceIds.length === 0
      ? []
      : await db
          .select({ sentenceId: sentenceLexemes.sentenceId, lexemeId: sentenceLexemes.lexemeId })
          .from(sentenceLexemes)
          .where(inArray(sentenceLexemes.sentenceId, sentenceIds));
  const sentenceLexemeMap: Record<string, string[]> = {};
  for (const t of tokenRows) (sentenceLexemeMap[t.sentenceId] ??= []).push(t.lexemeId);

  const lexemeIds = [
    ...new Set([...ids.flatMap((r) => r.lexemeIds), ...tokenRows.map((t) => t.lexemeId)]),
  ];
  const lexemeRows =
    lexemeIds.length === 0
      ? []
      : await db
          .select({ id: lexemes.id, lemma: lexemes.lemma, nounClassLabel: nounClasses.label })
          .from(lexemes)
          .leftJoin(nounClasses, eq(nounClasses.id, lexemes.nounClassId))
          .where(inArray(lexemes.id, lexemeIds));
  const glossRows =
    lexemeIds.length === 0
      ? []
      : await db
          .select({ lexemeId: glosses.lexemeId, gloss: glosses.gloss })
          .from(glosses)
          .where(and(inArray(glosses.lexemeId, lexemeIds), eq(glosses.sourceLang, "en")));
  const lexemeMap: UnitReconcileSnapshot["lexemes"] = {};
  for (const l of lexemeRows) lexemeMap[l.id] = { ...l, glosses: [] };
  for (const g of glossRows) lexemeMap[g.lexemeId]?.glosses.push(g.gloss);

  return {
    oldUnit,
    newUnit,
    notes,
    skillIds,
    lexemes: lexemeMap,
    sentenceLexemes: sentenceLexemeMap,
  };
}
