import { parseSeenNotes, withNoteSeen } from "@molo/core/grammar-rules";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Which grammar notes this device has already shown and had dismissed.
 *
 * The web keeps the same fact in `localStorage` and both read the same rule
 * out of `@molo/core/grammar-rules`, because it is the same rule: being
 * interrupted by a rule is a preference, not progress. Nothing is lost if it
 * goes — a learner on a new phone meets a rule once more, which is not a
 * harm — and it costs neither a table nor a round trip mid-lesson. Which
 * rules a learner has *unlocked* is a server fact, asked for separately.
 *
 * AsyncStorage is async, so the lesson screen reads this once on mount and
 * holds the answer; a note never flickers back in halfway through.
 */
const KEY = "molo.grammar.seen";

export async function readSeenNotes(): Promise<string[]> {
  try {
    return parseSeenNotes(await AsyncStorage.getItem(KEY));
  } catch {
    return [];
  }
}

/** Records a dismissal and hands back the new list, so a caller can render without re-reading. */
export async function markNoteSeen(id: string): Promise<string[]> {
  const next = withNoteSeen(await readSeenNotes(), id);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage refused: the note simply shows again next time */
  }
  return next;
}

export async function forgetSeenNotes(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
