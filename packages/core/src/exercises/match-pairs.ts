/**
 * The meanings column of a `match_pairs` exercise. The words stand in the
 * payload's order on the left; the meanings are rearranged on the right so
 * that **no meaning sits in the same row as its own word** — otherwise the
 * exercise answers itself, and a learner who notices stops reading.
 *
 * The two clients used to shuffle the meanings with a seed taken from the
 * ids, which is deterministic but not a derangement: for some exercises the
 * shuffle left a pair in its row, or all of them, and it did so every time,
 * for everyone. This is the one ordering both clients now use.
 *
 * Pure and deterministic per exercise: the same ids give the same column on
 * web and mobile, on every render, with no randomness to store.
 */

/** A 32-bit hash of the text, the same one the clients seed their shuffles with. */
function seedOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * `items` rearranged so that nothing stays at its own index, for two or more
 * items (one item cannot move; none is nothing). Sattolo's algorithm: the
 * Fisher-Yates shuffle with the swap partner drawn from strictly below `i`,
 * which makes the result a single cycle through every position — so no
 * position maps to itself. Deterministic in `seed`, with the same
 * linear congruential generator as the clients' `shuffle`.
 *
 * Positions, not values, are what move: with repeated values a repeat can
 * land where its twin was. The ids a `match_pairs` exercise passes are
 * distinct.
 */
export function derange<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * i);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/**
 * The right-hand column for these word ids, in display order: a derangement
 * of `ids`, seeded by the ids themselves, so row `i` never holds `ids[i]`.
 */
export function matchPairsMeanings(ids: readonly string[]): string[] {
  return derange(ids, seedOf(ids.join("|")));
}
