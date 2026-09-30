import AsyncStorage from "@react-native-async-storage/async-storage";

import { parseStudioSession, type StudioSessionState } from "./studio-session.ts";

/**
 * Device storage for the phone studio's place in the queue, per editor.
 * Only ids are stored (speaker, unit, item keys); no editorial text and no
 * audio, so nothing here is content that could be read offline.
 */
const keyFor = (actorId: string) => `molo.studio.session.${actorId}`;

/**
 * The same state for the life of the JS runtime, so a remount after
 * auto-lock or a reconnect restores synchronously and never races the
 * asynchronous write below.
 */
const memory = new Map<string, StudioSessionState>();

export function cachedStudioSession(actorId: string): StudioSessionState | null {
  return memory.get(actorId) ?? null;
}

export async function loadStudioSession(actorId: string): Promise<StudioSessionState | null> {
  const cached = memory.get(actorId);
  if (cached) return cached;
  try {
    return parseStudioSession(await AsyncStorage.getItem(keyFor(actorId)));
  } catch {
    return null;
  }
}

export async function saveStudioSession(actorId: string, state: StudioSessionState) {
  memory.set(actorId, state);
  try {
    await AsyncStorage.setItem(keyFor(actorId), JSON.stringify(state));
  } catch {
    /* best effort: the session still works, it just will not survive a restart */
  }
}
