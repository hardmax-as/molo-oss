import { describe, expect, it } from "vitest";

import { checkToken, isVerified, type TokenFacts } from "./verify.ts";

const noun: TokenFacts = {
  position: 0,
  lexemeId: "00000000-0000-4000-8000-000000000001",
  surfaceForm: "inja",
  lemma: "inja",
  pos: "noun",
  nounClass: "9",
  generatedPlural: "izinja",
  classValidated: false,
};

describe("checkToken", () => {
  it("accepts the lemma itself regardless of class validation", () => {
    const v = checkToken(noun);
    expect(v.state).toBe("verified");
    expect(v.matched).toBe("lemma");
    expect(isVerified(v)).toBe(true);
  });

  it("normalises case, whitespace and unicode form before comparing", () => {
    expect(checkToken({ ...noun, surfaceForm: "  Inja " }).state).toBe("verified");
  });

  it("does not verify a generated plural until the class is tutor-validated", () => {
    const v = checkToken({ ...noun, surfaceForm: "izinja" });
    expect(v.state).toBe("unverified");
    expect(v.matched).toBe("plural");
    expect(v.reason).toContain("not tutor-validated");
    expect(checkToken({ ...noun, surfaceForm: "izinja", classValidated: true })).toMatchObject({
      state: "verified",
      matched: "plural",
    });
  });

  it("flags a form that matches neither the lemma nor the plural", () => {
    const v = checkToken({ ...noun, surfaceForm: "izinjana" });
    expect(v.state).toBe("mismatch");
    expect(v.expectedPlural).toBe("izinja");
    expect(v.reason).toContain("izinja");
  });

  it("is unverified, not a mismatch, when xh-morph has nothing to compare against", () => {
    const verb = checkToken({
      ...noun,
      surfaceForm: "ndiyatya",
      lemma: "-tya",
      pos: "verb",
      nounClass: null,
      generatedPlural: null,
    });
    expect(verb.state).toBe("unverified");
    expect(verb.reason).toContain("no rule");
    const noPlural = checkToken({ ...noun, surfaceForm: "izinja", generatedPlural: null });
    expect(noPlural.state).toBe("unverified");
    expect(noPlural.reason).toContain("could not generate");
  });
});
