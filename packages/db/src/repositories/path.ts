/**
 * The path a learner walks (docs/DESIGN.md "The path"). Reads the published
 * curriculum down to the lesson — never the exercise payloads, which are an
 * order of magnitude larger and are only needed once a lesson is opened —
 * and folds this learner's own state onto it: how often each lesson has
 * been finished, and which end-of-skill chests have been taken.
 *
 * Like every other learner read, `status = 'published'` is appended
 * unconditionally and there is no parameter that widens it.
 */

import type { ExerciseType, LessonKind, SkillKind } from "@molo/core";
import { crownLevelOf, lessonKindOf } from "@molo/core";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Db } from "../client.ts";
import { exercises, lessons, skills, units } from "../schema/curriculum.ts";
import { skillChests, xpEvents } from "../schema/learners.ts";

const PUBLISHED = "published" as const;

export interface PathLessonRead {
  readonly id: string;
  readonly order: number;
  readonly estimatedMinutes: number;
  readonly exerciseCount: number;
  readonly kind: LessonKind;
  readonly crownLevel: number;
}

export interface PathSkillRead {
  readonly id: string;
  readonly slug: string;
  readonly titleKey: string;
  readonly order: number;
  readonly kind: SkillKind;
  readonly lessons: readonly PathLessonRead[];
  readonly chestClaimed: boolean;
}

export interface PathUnitRead {
  readonly id: string;
  readonly skills: readonly PathSkillRead[];
}

export type ChestClaim =
  | { readonly ok: true; readonly xp: number; readonly alreadyClaimed: boolean }
  | { readonly ok: false; readonly reason: "not_found" | "not_ready" };

export function pathRepo(db: Db) {
  /**
   * Every published unit's skills and lessons, in order, each lesson
   * carrying what it drills and how often this learner has finished it.
   * `userId` is null for a guest: the curriculum is the same, the state is
   * all zeroes, and the client overlays what it kept on the device.
   */
  async function overview(userId: string | null): Promise<PathUnitRead[]> {
    const rows = await db
      .select({
        unitId: units.id,
        unitOrder: units.order,
        skillId: skills.id,
        skillSlug: skills.slug,
        skillTitleKey: skills.titleKey,
        skillOrder: skills.order,
        skillKind: skills.kind,
        lessonId: lessons.id,
        lessonOrder: lessons.order,
        estimatedMinutes: lessons.estimatedMinutes,
      })
      .from(units)
      .innerJoin(skills, and(eq(skills.unitId, units.id), eq(skills.status, PUBLISHED)))
      .innerJoin(lessons, and(eq(lessons.skillId, skills.id), eq(lessons.status, PUBLISHED)))
      .where(eq(units.status, PUBLISHED))
      .orderBy(asc(units.order), asc(skills.order), asc(lessons.order));

    const lessonIds = rows.map((r) => r.lessonId);
    const [types, completions, claimed] = await Promise.all([
      exerciseTypesByLesson(lessonIds),
      userId ? completionsByLesson(userId, lessonIds) : new Map<string, number>(),
      userId ? claimedSkillIds(userId) : new Set<string>(),
    ]);

    // Group in one pass; the query is already sorted the way the path runs.
    const byUnit = new Map<
      string,
      { skills: Map<string, PathSkillRead & { lessons: PathLessonRead[] }> }
    >();
    const order: string[] = [];
    for (const r of rows) {
      let unit = byUnit.get(r.unitId);
      if (!unit) {
        unit = { skills: new Map() };
        byUnit.set(r.unitId, unit);
        order.push(r.unitId);
      }
      let skill = unit.skills.get(r.skillId);
      if (!skill) {
        skill = {
          id: r.skillId,
          slug: r.skillSlug,
          titleKey: r.skillTitleKey,
          order: r.skillOrder,
          kind: r.skillKind,
          lessons: [],
          chestClaimed: claimed.has(r.skillId),
        };
        unit.skills.set(r.skillId, skill);
      }
      const lessonTypes = types.get(r.lessonId) ?? [];
      skill.lessons.push({
        id: r.lessonId,
        order: r.lessonOrder,
        estimatedMinutes: r.estimatedMinutes,
        exerciseCount: lessonTypes.length,
        // `final` is decided below, once the unit's last lesson is known.
        kind: lessonKindOf({ types: lessonTypes }),
        crownLevel: crownLevelOf(completions.get(r.lessonId) ?? 0),
      });
    }

    return order.map((unitId) => {
      const skillRows = [...byUnit.get(unitId)!.skills.values()];
      const lastSkill = skillRows[skillRows.length - 1];
      const lastLesson = lastSkill?.lessons[lastSkill.lessons.length - 1];
      return {
        id: unitId,
        skills: skillRows.map((s) => ({
          ...s,
          lessons: s.lessons.map((l) =>
            // The unit's last lesson is its test, whatever it holds.
            l.id === lastLesson?.id
              ? { ...l, kind: lessonKindOf({ types: types.get(l.id) ?? [], final: true }) }
              : l,
          ),
        })),
      };
    });
  }

  async function exerciseTypesByLesson(
    lessonIds: readonly string[],
  ): Promise<Map<string, ExerciseType[]>> {
    if (lessonIds.length === 0) return new Map();
    const rows = await db
      .select({ lessonId: exercises.lessonId, type: exercises.type })
      .from(exercises)
      .where(and(inArray(exercises.lessonId, [...lessonIds]), eq(exercises.status, PUBLISHED)))
      .orderBy(asc(exercises.order));
    const by = new Map<string, ExerciseType[]>();
    for (const r of rows) {
      const list = by.get(r.lessonId) ?? [];
      list.push(r.type);
      by.set(r.lessonId, list);
    }
    return by;
  }

  /**
   * How often each lesson has been finished, from the append-only
   * `xp_events` — the same fact `completedLessonIds` reads, counted rather
   * than flattened, because the node fills up as the lesson is repeated.
   */
  async function completionsByLesson(
    userId: string,
    lessonIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (lessonIds.length === 0) return new Map();
    const rows = await db
      .select({ refId: xpEvents.refId, n: sql<number>`count(*)::int` })
      .from(xpEvents)
      .where(
        and(
          eq(xpEvents.userId, userId),
          eq(xpEvents.refKind, "lesson"),
          inArray(xpEvents.refId, [...lessonIds]),
        ),
      )
      .groupBy(xpEvents.refId);
    return new Map(rows.flatMap((r) => (r.refId ? [[r.refId, Number(r.n)] as const] : [])));
  }

  async function claimedSkillIds(userId: string): Promise<Set<string>> {
    const rows = await db
      .select({ skillId: skillChests.skillId })
      .from(skillChests)
      .where(eq(skillChests.userId, userId));
    return new Set(rows.map((r) => r.skillId));
  }

  return {
    overview,
    claimedSkillIds,

    /**
     * Takes the chest at the end of a skill. Three refusals, in order: the
     * skill is not published, not every one of its published lessons has
     * been finished, or it has already been taken. The unique constraint on
     * (user, skill) is what actually enforces "once" — two racing requests
     * both check and only one inserts.
     */
    async claimChest(userId: string, skillId: string, xp: number): Promise<ChestClaim> {
      const [skill] = await db
        .select({ id: skills.id })
        .from(skills)
        .where(and(eq(skills.id, skillId), eq(skills.status, PUBLISHED)))
        .limit(1);
      if (!skill) return { ok: false, reason: "not_found" };

      const lessonRows = await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(and(eq(lessons.skillId, skillId), eq(lessons.status, PUBLISHED)));
      if (lessonRows.length === 0) return { ok: false, reason: "not_ready" };
      const done = await completionsByLesson(
        userId,
        lessonRows.map((l) => l.id),
      );
      if (!lessonRows.every((l) => (done.get(l.id) ?? 0) > 0))
        return { ok: false, reason: "not_ready" };

      const inserted = await db
        .insert(skillChests)
        .values({ userId, skillId, xpAwarded: Math.max(0, Math.round(xp)) })
        .onConflictDoNothing({ target: [skillChests.userId, skillChests.skillId] })
        .returning({ id: skillChests.id, xpAwarded: skillChests.xpAwarded });
      const row = inserted[0];
      return row
        ? { ok: true, xp: row.xpAwarded, alreadyClaimed: false }
        : { ok: true, xp: 0, alreadyClaimed: true };
    },
  };
}

export type PathRepo = ReturnType<typeof pathRepo>;
