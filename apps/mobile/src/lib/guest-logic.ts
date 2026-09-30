/**
 * A guest's progress (mirrors apps/web/src/lib/guest.ts): finished lessons
 * with their scores and XP, kept on the device until they create an account.
 * The first lesson is free to try; the second asks for an account so the XP
 * and streak can be saved. Pure helpers here; storage lives in guest.ts so
 * this file runs under Jest without native modules.
 */

import { XP } from "@molo/core/gamification";

export interface GuestLesson {
  lessonId: string;
  unitSlug: string;
  correct: number;
  total: number;
  xp: number;
  today: string;
  /** The lexemes this lesson taught, so a guest can be told which word is new. */
  teaches?: string[];
}

export interface GuestProgress {
  lessons: GuestLesson[];
  /** Skill ids whose end-of-skill chest the guest has opened on this device. */
  chests: string[];
  /** Lexemes missed and not yet got right again: the guest's own mistake list. */
  mistakes?: string[];
}

export const EMPTY_GUEST: GuestProgress = { lessons: [], chests: [], mistakes: [] };

/** How many lessons a guest may finish before the account wall. */
export const GUEST_FREE_LESSONS = 1;

/** Tolerates a corrupt or older value: anything that is not a lesson list reads as empty. */
export function parseGuest(raw: string): GuestProgress {
  try {
    const v = JSON.parse(raw) as { lessons?: unknown; chests?: unknown };
    if (!v || !Array.isArray(v.lessons)) return EMPTY_GUEST;
    const mistakes = (v as { mistakes?: unknown }).mistakes;
    return {
      lessons: v.lessons.filter(isLesson),
      // Older copies have no chests and no mistakes; an empty list is the
      // honest reading of both, and keeps one shape for every caller.
      chests: Array.isArray(v.chests) ? v.chests.filter((c) => typeof c === "string") : [],
      mistakes: Array.isArray(mistakes)
        ? mistakes.filter((x): x is string => typeof x === "string")
        : [],
    };
  } catch {
    return EMPTY_GUEST;
  }
}

function isLesson(x: unknown): x is GuestLesson {
  if (!x || typeof x !== "object") return false;
  const l = x as Record<string, unknown>;
  return (
    typeof l.lessonId === "string" &&
    typeof l.unitSlug === "string" &&
    typeof l.correct === "number" &&
    typeof l.total === "number" &&
    typeof l.xp === "number" &&
    typeof l.today === "string"
  );
}

/**
 * A replayed lesson replaces its earlier result; the newest score is the one
 * that counts. `missed` is the words got wrong this time: a word the lesson
 * taught and the learner did not miss again drops off the mistake list, the
 * same way `mistakesRepo.resolve` clears a row on the server.
 */
export function withLesson(
  g: GuestProgress,
  lesson: GuestLesson,
  missed: readonly string[] = [],
): GuestProgress {
  const taught = new Set(lesson.teaches ?? []);
  const kept = (g.mistakes ?? []).filter((id) => !taught.has(id) || missed.includes(id));
  return {
    ...g,
    lessons: [...g.lessons.filter((l) => l.lessonId !== lesson.lessonId), lesson],
    mistakes: [...new Set([...kept, ...missed])],
  };
}

/**
 * Words this guest has met, from the lessons on the device. The signed-in
 * equivalent is `learnerRepo.seenLexemeIds`; both feed the same `momentFor`
 * rule in @molo/core, so the badge means the same thing either side of an
 * account.
 */
export function guestSeenLexemes(g: GuestProgress): Set<string> {
  return new Set(g.lessons.flatMap((l) => l.teaches ?? []));
}

/** Words this guest has missed and not yet cleared. */
export function guestTrickyLexemes(g: GuestProgress): Set<string> {
  return new Set(g.mistakes ?? []);
}

/** Opening a chest is once per skill here too; the server re-checks at sign-up. */
export function withChest(g: GuestProgress, skillId: string): GuestProgress {
  return g.chests.includes(skillId) ? g : { ...g, chests: [...g.chests, skillId] };
}

/** Everything the guest has earned on this device: lessons plus opened chests. */
export function guestXp(g: GuestProgress): number {
  return g.lessons.reduce((n, l) => n + l.xp, 0) + g.chests.length * XP.skillChest;
}

/** True when this lesson is beyond the guest allowance (a finished lesson can always be replayed). */
export function guestMustSignUp(g: GuestProgress, lessonId: string): boolean {
  if (g.lessons.some((l) => l.lessonId === lessonId)) return false;
  return g.lessons.length >= GUEST_FREE_LESSONS;
}
