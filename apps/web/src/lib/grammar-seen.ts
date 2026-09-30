import { parseSeenNotes, withNoteSeen } from "@molo/core";

/**
 * Which grammar notes this learner has already been shown and dismissed.
 *
 * NEXT.md asks for the note to be "skippable, and remembered, so a learner
 * who has seen it once is not stopped by it again". This is that memory, and
 * it lives in the browser on purpose: being interrupted by a rule is a
 * preference, not progress. Nothing is lost if it goes — a learner on a new
 * machine meets a rule once more, which is not a harm — and it costs neither
 * a table nor a round trip in the middle of a lesson. Which rules a learner
 * has *unlocked* is a server fact and is asked for separately (`/grammar`).
 *
 * The rule itself is shared with mobile in `@molo/core`; only the storage
 * differs. Every access is wrapped: private mode and blocked site data both
 * throw.
 */
const KEY = "molo.grammar.seen";

export function readSeenNotes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return parseSeenNotes(window.localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

/** Records a dismissal and hands back the new list, so a caller can render without re-reading. */
export function markNoteSeen(id: string): string[] {
  const next = withNoteSeen(readSeenNotes(), id);
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: the note simply shows again next time */
  }
  return next;
}

/** Used by the developer gallery so a demo is not eaten by an earlier visit. */
export function forgetSeenNotes(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
