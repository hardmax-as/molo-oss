/**
 * When the guide speaks. The crane says something on the very first visit
 * to the path and again after a long absence; in between it just stands
 * there. The rule is `guideSpeechFor` in @molo/core so mobile behaves the
 * same; this file only remembers the last visit, in localStorage, so
 * nothing about it needs the network or an account.
 */

import { guideSpeechFor, type GuideSpeech } from "@molo/core";

export { guideSpeechFor, LONG_ABSENCE_DAYS, type GuideSpeech } from "@molo/core";

const KEY = "molo.path.seen";

/**
 * Answered once per page load. Reading and then writing the date in an
 * effect is not idempotent — React runs effects twice in development, and a
 * remount would do it again — so the verdict is cached here and the write
 * happens with it. Anything else silences the greeting it just decided on.
 */
let resolved: GuideSpeech | undefined;

export function resolveSpeech(today: string): GuideSpeech {
  if (resolved !== undefined) return resolved;
  let lastSeen: string | null = null;
  try {
    lastSeen = localStorage.getItem(KEY);
  } catch {
    // private mode: treat it as a first visit
  }
  resolved = guideSpeechFor(lastSeen, today);
  try {
    localStorage.setItem(KEY, today);
  } catch {
    // private mode: the guide greets again next time, which is harmless
  }
  return resolved;
}
