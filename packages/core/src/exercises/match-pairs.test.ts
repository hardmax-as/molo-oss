import { describe, expect, it } from "vitest";

import { derange, matchPairsMeanings } from "./match-pairs.ts";

/** Lexeme-shaped ids; `set` varies them the way real exercises do. */
const idsFor = (set: number, n: number): string[] =>
  Array.from(
    { length: n },
    (_, i) => `00000000-0000-4000-8000-${String(set * 10 + i).padStart(12, "0")}`,
  );

/** The shuffle both clients used before: deterministic, but free to leave a pair in its row. */
function oldShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
function seedOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const fixedPoints = (ids: readonly string[], right: readonly string[]) =>
  ids.filter((id, i) => right[i] === id).length;

const SETS = 400;

describe("matchPairsMeanings", () => {
  for (let n = 2; n <= 6; n++) {
    describe(`${n} pairs`, () => {
      it("never leaves a meaning in its word's row", () => {
        for (let set = 0; set < SETS; set++) {
          const ids = idsFor(set, n);
          expect(fixedPoints(ids, matchPairsMeanings(ids))).toBe(0);
        }
      });

      it("is a permutation of the words: every meaning once, nothing added", () => {
        for (let set = 0; set < SETS; set++) {
          const ids = idsFor(set, n);
          const right = matchPairsMeanings(ids);
          expect(right).toHaveLength(n);
          expect([...right].sort()).toEqual([...ids].sort());
        }
      });

      it("is deterministic per exercise", () => {
        for (let set = 0; set < 50; set++) {
          const ids = idsFor(set, n);
          expect(matchPairsMeanings(ids)).toEqual(matchPairsMeanings([...ids]));
        }
      });
    });
  }

  it("fixes the exercises the old shuffle left answering themselves", () => {
    let leaky = 0;
    for (let n = 2; n <= 6; n++) {
      for (let set = 0; set < SETS; set++) {
        const ids = idsFor(set, n);
        if (fixedPoints(ids, oldShuffle(ids, seedOf(ids.join("|")))) === 0) continue;
        leaky++;
        expect(fixedPoints(ids, matchPairsMeanings(ids))).toBe(0);
      }
    }
    // The bug was real and common, not a corner case this suite happens to miss.
    expect(leaky).toBeGreaterThan(100);
  });

  it("still varies the layout between exercises rather than always rotating by one", () => {
    const patterns = new Set<string>();
    for (let set = 0; set < SETS; set++) {
      const ids = idsFor(set, 4);
      patterns.add(
        matchPairsMeanings(ids)
          .map((id) => ids.indexOf(id))
          .join(""),
      );
    }
    expect(patterns.size).toBeGreaterThan(3);
  });

  it("leaves one pair, or none, as it is and does not touch its input", () => {
    expect(matchPairsMeanings([])).toEqual([]);
    const one = idsFor(1, 1);
    expect(matchPairsMeanings(one)).toEqual(one);
    const ids = idsFor(2, 5);
    const copy = [...ids];
    matchPairsMeanings(ids);
    expect(ids).toEqual(copy);
  });
});

describe("derange", () => {
  it("moves every position for any seed, including zero", () => {
    for (const seed of [0, 1, 7, 233279, 2 ** 32 - 1]) {
      for (let n = 2; n <= 6; n++) {
        const items = Array.from({ length: n }, (_, i) => i);
        const out = derange(items, seed);
        expect(out.every((v, i) => v !== i)).toBe(true);
        expect([...out].sort()).toEqual(items);
      }
    }
  });
});
