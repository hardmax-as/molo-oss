/**
 * Unit prerequisites (ARCHITECTURE section 2.2). A unit is locked until the
 * learner has finished the one it depends on: every published lesson
 * completed, or the unit crowned. The rule itself is the pure
 * `lockedUnitIds` in @molo/core; this module feeds it the learner's data
 * and hands the result to the units endpoints and to the lesson-completion
 * guard, so the lock is not cosmetic.
 *
 * A guest has no server state, so the server locks nothing for them and the
 * clients apply the same rule to the lessons kept on the device.
 */

import { CROWN_MIN_STABILITY_DAYS, lockedUnitIds } from "@molo/core";
import { learnerRepo, type Db, type PublishedUnitSummary } from "@molo/db";
import { completedLessonIds } from "@molo/gamification";
import { matureLexemeIds } from "@molo/scheduler";

export interface UnitLockView {
  readonly locked: boolean;
  readonly lessonCount: number;
  readonly prerequisiteSlug: string | null;
  readonly prerequisiteTitleKey: string | null;
}

export interface UnitLocks {
  readonly byUnitId: ReadonlyMap<string, UnitLockView>;
  /** Published lesson id → its unit, so the lesson endpoints can refuse a locked unit. */
  readonly unitOfLesson: ReadonlyMap<string, string>;
  /**
   * The two reads this took, handed back so a caller that needs them — the
   * lesson-complete route, for its "you finished the unit" beat — does not
   * ask the database for them a second time.
   */
  readonly units: ReadonlyMap<string, PublishedUnitSummary>;
  readonly lessonsOfUnit: ReadonlyMap<string, readonly string[]>;
}

const OPEN: UnitLockView = {
  locked: false,
  lessonCount: 0,
  prerequisiteSlug: null,
  prerequisiteTitleKey: null,
};

export function lockViewOf(locks: UnitLocks, unitId: string): UnitLockView {
  return locks.byUnitId.get(unitId) ?? OPEN;
}

/**
 * Every published unit's lock state for this learner, within one course
 * (`null` userId for a guest: nothing is locked server-side). Prerequisites
 * never cross a course: a unit's chain lives in its own curriculum.
 */
export async function unitLocks(
  db: Db,
  userId: string | null,
  courseId: string,
): Promise<UnitLocks> {
  const repo = learnerRepo(db);
  const [units, index] = await Promise.all([
    repo.listUnits(courseId),
    repo.unitContentIndex(courseId),
  ]);
  const contentByUnit = new Map(index.map((i) => [i.unitId, i]));
  const unitOfLesson = new Map<string, string>();
  for (const i of index) for (const lessonId of i.lessonIds) unitOfLesson.set(lessonId, i.unitId);
  const bySlugId = new Map(units.map((u) => [u.id, u]));

  const finished = new Set<string>();
  if (userId) {
    const allLessonIds = index.flatMap((i) => [...i.lessonIds]);
    const allLexemeIds = [...new Set(index.flatMap((i) => [...i.lexemeIds]))];
    const [done, mature] = await Promise.all([
      completedLessonIds(db, userId, allLessonIds),
      matureLexemeIds(db, userId, allLexemeIds, CROWN_MIN_STABILITY_DAYS),
    ]);
    const matureSet = new Set(mature);
    for (const i of index) {
      const everyLessonDone = i.lessonIds.length > 0 && i.lessonIds.every((id) => done.has(id));
      const crowned = i.lexemeIds.length > 0 && i.lexemeIds.every((id) => matureSet.has(id));
      if (everyLessonDone || crowned) finished.add(i.unitId);
    }
  }

  const locked = userId ? lockedUnitIds(units, finished) : new Set<string>();
  const byUnitId = new Map<string, UnitLockView>();
  for (const u of units) {
    const prereq = u.prerequisiteUnitId ? (bySlugId.get(u.prerequisiteUnitId) ?? null) : null;
    byUnitId.set(u.id, {
      locked: locked.has(u.id),
      lessonCount: contentByUnit.get(u.id)?.lessonIds.length ?? 0,
      prerequisiteSlug: prereq?.slug ?? null,
      prerequisiteTitleKey: prereq?.titleKey ?? null,
    });
  }
  return {
    byUnitId,
    unitOfLesson,
    units: bySlugId,
    lessonsOfUnit: new Map(index.map((i) => [i.unitId, i.lessonIds])),
  };
}

/** True when this lesson sits in a unit the learner has not unlocked yet. */
export async function lessonIsLocked(
  db: Db,
  userId: string,
  lessonId: string,
  courseId: string,
): Promise<boolean> {
  const locks = await unitLocks(db, userId, courseId);
  const unitId = locks.unitOfLesson.get(lessonId);
  return unitId !== undefined && lockViewOf(locks, unitId).locked;
}
