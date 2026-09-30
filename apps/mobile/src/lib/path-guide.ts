import { guideSpeechFor, type GuideSpeech } from "@molo/core";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * When the guide speaks (mirrors apps/web/src/lib/path-guide.ts). The rule
 * is `guideSpeechFor` in @molo/core; this file only remembers the last
 * visit on the device, and answers once per launch — reading and then
 * writing the date on every mount would silence the greeting it had just
 * decided on.
 */

export { guideSpeechFor, LONG_ABSENCE_DAYS, type GuideSpeech } from "@molo/core";

const KEY = "molo.path.seen";

let resolved: GuideSpeech | undefined;

export async function resolveSpeech(today: string): Promise<GuideSpeech> {
  if (resolved !== undefined) return resolved;
  let lastSeen: string | null = null;
  try {
    lastSeen = await AsyncStorage.getItem(KEY);
  } catch {
    // storage unavailable: treat it as a first visit
  }
  resolved = guideSpeechFor(lastSeen, today);
  try {
    await AsyncStorage.setItem(KEY, today);
  } catch {
    // the guide greets again next launch, which is harmless
  }
  return resolved;
}
