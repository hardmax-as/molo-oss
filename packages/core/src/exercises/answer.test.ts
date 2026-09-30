import { describe, expect, it } from "vitest";

import { answerMatches, normaliseXhosa } from "./answer.ts";

describe("normaliseXhosa", () => {
  it("drops tone marks, case, punctuation and extra spaces", () => {
    expect(normaliseXhosa("  Molo,  unjáni? ")).toBe("molo unjani");
    expect(normaliseXhosa("Ndiyaphíla")).toBe("ndiyaphila");
  });
});

describe("answerMatches", () => {
  it("accepts an exact match, with or without tone marks", () => {
    expect(answerMatches("Molo unjani", "Molo, unjani?")).toEqual({ ok: true, typo: false });
    expect(answerMatches("ndiyaphila", "Ndiyaphíla")).toEqual({ ok: true, typo: false });
  });

  it("forgives one typo in a long word but never in a click", () => {
    expect(answerMatches("Ndiyaphile", "Ndiyaphila")).toEqual({ ok: true, typo: true });
    // The typo hits a click consonant: refused and named.
    expect(answerMatches("Ndiyavuya kakhulu", "Ndiyavuya kakhulu")).toEqual({
      ok: true,
      typo: false,
    });
    expect(answerMatches("ukutsala", "ukuxhala")).toEqual({ ok: false, reason: "click" });
    expect(answerMatches("inkomo", "inqomo")).toEqual({ ok: false, reason: "click" });
  });

  it("refuses short-word typos and different word counts", () => {
    expect(answerMatches("mola", "molo")).toEqual({ ok: false, reason: "wrong" });
    expect(answerMatches("molo", "molo unjani")).toEqual({ ok: false, reason: "wrong" });
    expect(answerMatches("", "molo")).toEqual({ ok: false, reason: "wrong" });
  });

  it("names a click error even when other letters are also wrong", () => {
    expect(answerMatches("ukutshala kakhulu", "ukuxhala kakhulu")).toEqual({
      ok: false,
      reason: "click",
    });
  });
});
