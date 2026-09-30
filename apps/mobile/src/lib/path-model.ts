/**
 * The node model for one unit's stretch of path. Pure: it takes the unit
 * payload the screen already has (network or the offline copy) plus this
 * learner's state, and produces the flat row list `@molo/core` defines —
 * the same list the web app renders, so a node means the same thing on
 * both clients. Storage and rendering live elsewhere so this runs in Jest
 * without native modules.
 */

import type { ExerciseType, UnitResponse } from "@molo/core";
import { XP } from "@molo/core/gamification";
import { buildPath, lessonKindOf, type PathRow, type PathUnitInput } from "@molo/core/path";

export type PathUnitPayload = UnitResponse["unit"];

export interface PathState {
  /** Times this learner has finished the lesson; 0 or 1 is all a guest can say. */
  readonly crownOf: (lessonId: string) => number;
  readonly chestClaimed: (skillId: string) => boolean;
  /** The guest account wall: this lesson is beyond the free allowance. */
  readonly lessonWalled: (lessonId: string) => boolean;
  /** The prerequisite lock, decided by the server or by the guest rule. */
  readonly unitLocked: boolean;
}

export const NO_PROGRESS: PathState = {
  crownOf: () => 0,
  chestClaimed: () => false,
  lessonWalled: () => false,
  unitLocked: false,
};

/** The last lesson of the last skill: the unit's test, whatever it holds. */
function finalLessonId(unit: PathUnitPayload): string | null {
  const lastSkill = unit.skills[unit.skills.length - 1];
  const lastLesson = lastSkill?.lessons[lastSkill.lessons.length - 1];
  return lastLesson?.id ?? null;
}

export function unitPathInput(unit: PathUnitPayload, state: PathState): PathUnitInput {
  const final = finalLessonId(unit);
  return {
    id: unit.id,
    slug: unit.slug,
    titleKey: unit.titleKey,
    cefrBand: unit.cefrBand,
    locked: state.unitLocked,
    prerequisiteSlug: unit.prerequisiteSlug,
    prerequisiteTitleKey: unit.prerequisiteTitleKey,
    skills: unit.skills.map((s) => ({
      id: s.id,
      slug: s.slug,
      titleKey: s.titleKey,
      kind: s.kind,
      chestClaimed: state.chestClaimed(s.id),
      lessons: s.lessons.map((l) => ({
        id: l.id,
        order: l.order,
        estimatedMinutes: l.estimatedMinutes,
        exerciseCount: l.exercises.length,
        kind: lessonKindOf({
          types: l.exercises.map((e) => e.type as ExerciseType),
          final: l.id === final,
        }),
        crownLevel: state.crownOf(l.id),
      })),
    })),
  };
}

/**
 * The rows the screen scrolls through, in walking order. `chestXp` is a
 * parameter only so the developer gallery's knobs panel can move it; the
 * app passes nothing and gets the shipped constant.
 */
export function unitPathRows(
  unit: PathUnitPayload,
  state: PathState,
  chestXp: number = XP.skillChest,
): readonly PathRow[] {
  const walled = new Set<string>();
  for (const s of unit.skills)
    for (const l of s.lessons) if (state.lessonWalled(l.id)) walled.add(l.id);
  return buildPath([unitPathInput(unit, state)], { chestXp, lockedLessonIds: walled });
}

export type PathNodeRow = Exclude<PathRow, { type: "unit" }>;
export interface PathSection {
  readonly unit: Extract<PathRow, { type: "unit" }>;
  readonly data: readonly PathNodeRow[];
}

/**
 * The rows regrouped for a `SectionList`: one section per unit, its header
 * the unit row. `stickySectionHeadersEnabled` then gives the travelling
 * section header for free, and the list stays windowed however long the
 * path grows.
 */
export function pathSections(rows: readonly PathRow[]): PathSection[] {
  const sections: { unit: Extract<PathRow, { type: "unit" }>; data: PathNodeRow[] }[] = [];
  for (const row of rows) {
    if (row.type === "unit") sections.push({ unit: row, data: [] });
    else sections[sections.length - 1]?.data.push(row);
  }
  return sections;
}
