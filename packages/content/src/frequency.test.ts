import { describe, expect, it } from "vitest";

import { frequencyScore, rankLexemes, SPOKEN_WEIGHT, WRITTEN_WEIGHT } from "./frequency.ts";

/** The real corpus sizes, so the assertions below are about the real ranking. */
const SIZES = { spokenTokens: 18_540, writtenTokens: 888_791 };

const ev = (id: string, spoken: number, written: number) => ({ id, lemma: id, spoken, written });

describe("frequency blending", () => {
  it("weights the conversational corpus nine to one", () => {
    expect(SPOKEN_WEIGHT / WRITTEN_WEIGHT).toBe(9);
  });

  it("ranks a word heard once above the most frequent word of government prose", () => {
    // This is the consequence the header names explicitly: with corpora that
    // differ in size by fifty times, "far above" means every spoken-attested
    // word comes first. If someone retunes the weights, this test tells them
    // what they changed.
    const hapax = frequencyScore(ev("heard-once", 1, 0), SIZES);
    const gazette = frequencyScore(ev("ukuba", 0, 19_360), SIZES);
    expect(hapax).toBeGreaterThan(gazette);
  });

  it("orders two spoken words by how often they are said", () => {
    const ranked = rankLexemes([ev("rare", 2, 5_000), ev("common", 40, 0)], SIZES);
    expect(ranked.map((r) => r.id)).toEqual(["common", "rare"]);
  });

  it("uses the written corpus to break a tie between equally spoken words", () => {
    const ranked = rankLexemes([ev("a-quiet", 5, 10), ev("b-loud", 5, 5_000)], SIZES);
    expect(ranked.map((r) => r.id)).toEqual(["b-loud", "a-quiet"]);
  });

  it("leaves a word attested nowhere unranked rather than ranking it last", () => {
    const ranked = rankLexemes([ev("known", 1, 0), ev("unknown", 0, 0)], SIZES);
    expect(ranked.map((r) => r.id)).toEqual(["known"]);
  });

  it("gives consecutive ranks from one", () => {
    const ranked = rankLexemes([ev("a", 1, 1), ev("b", 2, 1), ev("c", 3, 1)], SIZES);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("is deterministic when two words score identically", () => {
    const input = [ev("zulu", 3, 7), ev("alpha", 3, 7)];
    expect(rankLexemes(input, SIZES).map((r) => r.id)).toEqual(["alpha", "zulu"]);
    expect(rankLexemes(input.toReversed(), SIZES).map((r) => r.id)).toEqual(["alpha", "zulu"]);
  });
});
