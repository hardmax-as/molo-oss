/**
 * Listening and speaking modes. A learner on a bus turns listening off: the
 * exercises that need ears switch to their quiet variant (read the isiXhosa
 * instead of hearing it) and the ones that only make sense with sound are
 * skipped. Speaking off skips anything that records. Shared by web and
 * mobile so both apps keep the same lesson under the same settings.
 */

import type { ExercisePayload } from "./index.ts";

export interface Modes {
  readonly listening: boolean;
  readonly speaking: boolean;
}

export const DEFAULT_MODES: Modes = { listening: true, speaking: true };

export type ModeDecision =
  | { readonly keep: true; readonly quiet: boolean }
  | { readonly keep: false; readonly reason: "listening" | "speaking" };

/** What to do with one exercise under the given modes. */
export function decideForModes(payload: ExercisePayload, modes: Modes): ModeDecision {
  switch (payload.type) {
    case "listen_select":
    case "select_listen":
      // Has a quiet variant: the prompt or the options are shown as text.
      return { keep: true, quiet: !modes.listening };
    case "click_drill":
      if (!modes.listening) return { keep: false, reason: "listening" };
      if (!modes.speaking && payload.steps.every((s) => s === "record_compare"))
        return { keep: false, reason: "speaking" };
      return { keep: true, quiet: false };
    case "click_identify":
      // Nothing to read instead: the bare click is the whole prompt.
      if (!modes.listening) return { keep: false, reason: "listening" };
      return { keep: true, quiet: false };
    case "speak":
      if (!modes.speaking) return { keep: false, reason: "speaking" };
      if (!modes.listening) return { keep: false, reason: "listening" };
      return { keep: true, quiet: false };
    default:
      return { keep: true, quiet: false };
  }
}

export interface ModedExercise<T> {
  readonly exercise: T;
  readonly quiet: boolean;
}

/** Filters a lesson for the modes; `skipped` says why each dropped exercise went. */
export function applyModes<T>(
  items: ReadonlyArray<{ readonly exercise: T; readonly payload: ExercisePayload }>,
  modes: Modes,
): { kept: ModedExercise<T>[]; skipped: { listening: number; speaking: number } } {
  const kept: ModedExercise<T>[] = [];
  const skipped = { listening: 0, speaking: 0 };
  for (const item of items) {
    const d = decideForModes(item.payload, modes);
    if (d.keep) kept.push({ exercise: item.exercise, quiet: d.quiet });
    else skipped[d.reason]++;
  }
  return { kept, skipped };
}
