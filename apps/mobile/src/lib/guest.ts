import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  EMPTY_GUEST,
  parseGuest,
  withChest,
  withLesson,
  type GuestLesson,
  type GuestProgress,
} from "./guest-logic.ts";

export {
  EMPTY_GUEST,
  GUEST_FREE_LESSONS,
  guestMustSignUp,
  guestSeenLexemes,
  guestTrickyLexemes,
  guestXp,
  type GuestLesson,
  type GuestProgress,
} from "./guest-logic.ts";

/**
 * Device storage for the guest's progress. On sign-up or sign-in the lessons
 * are replayed on the server once (`POST /me/import-progress`, see
 * guest-sync.tsx) and this copy is cleared.
 */
const KEY = "molo.guest";

export async function readGuest(): Promise<GuestProgress> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? parseGuest(raw) : EMPTY_GUEST;
  } catch {
    return EMPTY_GUEST;
  }
}

export async function recordGuestLesson(
  lesson: GuestLesson,
  /** Words missed in this lesson; the ones got right drop off the mistake list. */
  missed: readonly string[] = [],
): Promise<GuestProgress> {
  const next = withLesson(await readGuest(), lesson, missed);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: the tally survives this launch only
  }
  return next;
}

/** Opening a chest as a guest: kept here, replayed on the server at sign-up. */
export async function recordGuestChest(skillId: string): Promise<GuestProgress> {
  const next = withChest(await readGuest(), skillId);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: the chest survives this launch only
  }
  return next;
}

export async function clearGuest(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
