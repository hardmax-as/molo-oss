/**
 * What to load before the learner asks for it (docs/CACHING.md section 2.0).
 * Pure rules, shared so the phone and the browser warm the same things: the
 * unit that holds the learner's next lesson, and the recordings the next few
 * exercises of a lesson will play.
 *
 * None of this decides what a learner may see. Every payload these rules read
 * came from a learner endpoint, which serves published rows only; a prefetch
 * only moves that read earlier.
 */

import type { PathResponse, UnitResponse, UnitSummary } from "./api.ts";
import type { PathRow } from "./path.ts";
import { guestFinishedUnits, lockedUnitIds } from "./units.ts";

/** A lesson and the unit that holds it. */
export interface NextLesson {
  readonly unitSlug: string;
  readonly lessonId: string;
}

/**
 * The lesson the path points at: the node `buildPath` marked `current`. Null
 * when every open lesson is done, or everything left is locked. Given the
 * rows of one unit, it is that unit's first unfinished lesson.
 */
export function nextLessonOf(rows: readonly PathRow[]): NextLesson | null {
  for (const row of rows) {
    if (row.type === "lesson" && row.state === "current") {
      return { unitSlug: row.unitSlug, lessonId: row.lessonId };
    }
  }
  return null;
}

/**
 * The same answer straight from `/path`, for a client that has not built the
 * rows: the first lesson not yet finished in a unit that is not locked. It is
 * `buildPath`'s rule for `current` for a signed-in learner, who has no guest
 * wall.
 */
export function nextLessonInPath(path: Pick<PathResponse, "units">): NextLesson | null {
  for (const unit of path.units) {
    if (unit.locked) continue;
    for (const skill of unit.skills) {
      for (const lesson of skill.lessons) {
        if (lesson.crownLevel <= 0) return { unitSlug: unit.slug, lessonId: lesson.id };
      }
    }
  }
  return null;
}

/**
 * A guest's next unit from the unit list and the lessons kept on the device:
 * the first unit the guest may open and has not finished. Guests have no
 * crowns, so "finished" is every lesson done, exactly as for their locks.
 */
export function nextUnitForGuest(
  units: readonly Pick<UnitSummary, "id" | "slug" | "lessonCount" | "prerequisiteUnitId">[],
  lessons: readonly { readonly unitSlug: string; readonly lessonId: string }[],
): string | null {
  const finished = guestFinishedUnits(units, lessons);
  const locked = lockedUnitIds(units, finished);
  for (const unit of units) {
    if (!locked.has(unit.id) && !finished.has(unit.id)) return unit.slug;
  }
  return null;
}

type AudioContent = Pick<UnitResponse, "lexemes" | "sentences" | "audioAssets" | "clickAudio">;

/** Deep enough for every payload shape in `exercises/`, and a stop for a malformed one. */
const MAX_DEPTH = 6;

function own<T>(record: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * The recordings one exercise plays, in the order its payload names them:
 * every id in the payload that the unit hydrates as a word, a sentence, an
 * audio asset or a bare click, resolved to the voice the lesson plays (the
 * chosen one, never the alternatives). Read generically rather than per
 * exercise type, so a new type is covered the day it ships; an id that is not
 * a recording's is simply not found.
 */
export function exerciseAudioUrls(
  exercise: { readonly payload: unknown },
  content: AudioContent,
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const add = (url: string | undefined) => {
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };
  const visit = (value: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    if (typeof value === "string") {
      add(own(content.lexemes, value)?.audio?.url);
      add(own(content.sentences, value)?.audio?.url);
      add(own(content.audioAssets, value)?.url);
      add(own(content.clickAudio, value)?.url);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (value && typeof value === "object") {
      for (const key of Object.keys(value))
        visit((value as Record<string, unknown>)[key], depth + 1);
    }
  };
  visit(exercise.payload, 0);
  return urls;
}

/**
 * What to warm when a lesson opens: the recordings of `count` exercises from
 * `from`, in the order the learner meets them, each file once. Empty for a
 * lesson the unit does not hold.
 */
export function lessonAudioUrls(
  unit: UnitResponse,
  lessonId: string,
  from = 0,
  count = 3,
): string[] {
  const lesson = unit.unit.skills.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
  if (!lesson) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const exercise of lesson.exercises.slice(Math.max(0, from), Math.max(0, from) + count)) {
    for (const url of exerciseAudioUrls(exercise, unit)) {
      if (!seen.has(url)) {
        seen.add(url);
        out.push(url);
      }
    }
  }
  return out;
}

/**
 * Every recording any lesson of the unit plays, lesson by lesson. For caching
 * a unit's audio in the background on an unmetered connection; the manual
 * "download this unit" takes every voice instead (`audioRefsOf` on mobile).
 */
export function unitAudioUrls(unit: UnitResponse): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const skill of unit.unit.skills) {
    for (const lesson of skill.lessons) {
      for (const url of lessonAudioUrls(unit, lesson.id, 0, lesson.exercises.length)) {
        if (!seen.has(url)) {
          seen.add(url);
          out.push(url);
        }
      }
    }
  }
  return out;
}
