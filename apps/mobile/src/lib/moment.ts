/**
 * The badge above a lesson prompt, as data rather than as JSX: which badge
 * an exercise gets, and what it looks like. Pure, so Jest covers it without
 * a native environment and so the view has nothing left to decide.
 *
 * The rule itself is `momentFor` in @molo/core, shared with the web app and
 * with the server. This module only chooses *whose* answer to trust — the
 * server knows a signed-in learner's whole history, the device knows a
 * guest's — and maps the answer onto the palette in docs/DESIGN.md: a new
 * word is the sun, a word missed before is the coral.
 */

// The subpath, not the barrel: `@molo/core` pulls Effect in, and this module
// has to run under Jest without a native transform for it.
import { momentFor, type ExerciseMoment } from "@molo/core/lesson";

import { guestSeenLexemes, guestTrickyLexemes, type GuestProgress } from "./guest-logic.ts";

/** As much of an exercise as the badge needs. */
export interface BadgeableExercise {
  /** What the server said. Null for a guest, and null when it is neither. */
  readonly moment?: ExerciseMoment | null | undefined;
  /** The lexemes the exercise teaches, so a guest can answer for itself. */
  readonly teaches?: readonly string[] | undefined;
}

/**
 * The badge for one exercise. A guest's own history wins over the server's
 * null; a signed-in learner's answer is taken as given, because the device
 * has no record to argue with it.
 */
export function momentOf(
  exercise: BadgeableExercise,
  guest: GuestProgress | null,
): ExerciseMoment | null {
  if (!guest) return exercise.moment ?? null;
  return momentFor({
    teaches: exercise.teaches ?? [],
    seen: guestSeenLexemes(guest),
    tricky: guestTrickyLexemes(guest),
  });
}

export interface MomentBadge {
  readonly moment: ExerciseMoment;
  /** A key in packages/i18n; the badge never carries copy of its own. */
  readonly labelKey: "lesson.moment.newWord" | "lesson.moment.tricky";
  /** Palette roles from docs/DESIGN.md, resolved to real colours by the view. */
  readonly tone: "sun" | "coral";
}

const BADGES: Record<ExerciseMoment, MomentBadge> = {
  new_word: { moment: "new_word", labelKey: "lesson.moment.newWord", tone: "sun" },
  tricky: { moment: "tricky", labelKey: "lesson.moment.tricky", tone: "coral" },
};

/** What to draw, or null for the ordinary exercise that needs no label. */
export function badgeFor(moment: ExerciseMoment | null): MomentBadge | null {
  return moment ? BADGES[moment] : null;
}
