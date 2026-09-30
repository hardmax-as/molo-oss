/**
 * A guest's progress lives in the browser until they create an account:
 * finished lessons with their scores and XP, and the end-of-skill chests
 * they opened. The first lesson is free to try; the second asks for an
 * account so the XP and streak can be saved. On sign-up the lessons and the
 * chests are replayed on the server once (`/me/import-progress`) and the
 * local copy is cleared.
 */

import { XP } from "@molo/core";

const KEY = "molo.guest";

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
  /** Skill ids whose end-of-skill chest the guest has opened in this browser. */
  chests: string[];
  /** Lexemes missed and not yet got right again: the guest's own mistake list. */
  mistakes?: string[];
}

const EMPTY: GuestProgress = { lessons: [], chests: [], mistakes: [] };

export function readGuest(): GuestProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as { lessons?: unknown; chests?: unknown; mistakes?: unknown };
    if (!v || !Array.isArray(v.lessons)) return EMPTY;
    return {
      lessons: v.lessons as GuestLesson[],
      // Copies written before chests or mistakes existed have none; empty is
      // the honest reading of both.
      chests: Array.isArray(v.chests) ? v.chests.filter((c) => typeof c === "string") : [],
      mistakes: Array.isArray(v.mistakes) ? v.mistakes.filter((m) => typeof m === "string") : [],
    };
  } catch {
    return EMPTY;
  }
}

function write(next: GuestProgress): GuestProgress {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // private mode: the tally survives this page only
  }
  return next;
}

export function recordGuestLesson(
  lesson: GuestLesson,
  /** Words missed in this lesson; words got right drop off the list again. */
  missed: readonly string[] = [],
): GuestProgress {
  const g = readGuest();
  const taught = new Set(lesson.teaches ?? []);
  const kept = (g.mistakes ?? []).filter((id) => !taught.has(id) || missed.includes(id));
  return write({
    ...g,
    lessons: [...g.lessons.filter((l) => l.lessonId !== lesson.lessonId), lesson],
    mistakes: [...new Set([...kept, ...missed])],
  });
}

/** Opening a chest as a guest: once per skill here too, and replayed at sign-up. */
export function recordGuestChest(skillId: string): GuestProgress {
  const g = readGuest();
  if (g.chests.includes(skillId)) return g;
  return write({ ...g, chests: [...g.chests, skillId] });
}

/**
 * Words this guest has met, from the lessons on the device. The signed-in
 * equivalent is `learnerRepo.seenLexemeIds`; both feed the same
 * `momentFor` rule in @molo/core, so the badge means the same thing either
 * side of an account.
 */
export function guestSeenLexemes(g: GuestProgress): Set<string> {
  return new Set(g.lessons.flatMap((l) => l.teaches ?? []));
}

/** Words this guest has missed and not yet cleared. */
export function guestTrickyLexemes(g: GuestProgress): Set<string> {
  return new Set(g.mistakes ?? []);
}

export function clearGuest(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** Everything earned in this browser: lessons plus opened chests. */
export function guestXp(g: GuestProgress): number {
  return g.lessons.reduce((n, l) => n + l.xp, 0) + g.chests.length * XP.skillChest;
}

/** How many lessons a guest may finish before the account wall. */
export const GUEST_FREE_LESSONS = 1;

/** True when this lesson is beyond the guest allowance (a finished lesson can always be replayed). */
export function guestMustSignUp(g: GuestProgress, lessonId: string): boolean {
  if (g.lessons.some((l) => l.lessonId === lessonId)) return false;
  return g.lessons.length >= GUEST_FREE_LESSONS;
}
