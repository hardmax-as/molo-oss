import { Either, Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  PutGoldenAnswer,
  applyGoldenAnswers,
  goldenAnswerOf,
  goldenKey,
  GOLDEN_CLASSES,
  goldenOtherClass,
  goldenPairOf,
  goldenPullSkip,
  parseGoldenKey,
  type GoldenCase,
} from "./golden.ts";

const card: GoldenCase = {
  lemma: "zz-source",
  class: "1",
  form: "plural",
  expected: "",
  validated_by: "",
  validated_on: "",
  irregular: false,
  note: "fixture",
};
const decode = Schema.decodeUnknownEither(PutGoldenAnswer);

describe("golden answers on the server", () => {
  it("accepts only canonical case keys naming a class and a form the sheet has", () => {
    expect(parseGoldenKey(goldenKey(card))).toEqual({
      lemma: "zz-source",
      class: "1",
      form: "plural",
    });
    expect(parseGoldenKey('["zz","99","plural"]')).toBeNull();
    expect(parseGoldenKey('["zz","1","dative"]')).toBeNull();
    expect(parseGoldenKey('["","1","plural"]')).toBeNull();
    expect(parseGoldenKey('[ "zz", "1", "plural" ]')).toBeNull();
    expect(parseGoldenKey("not json")).toBeNull();
  });

  it("validates the request: an empty answer is allowed, a malformed date is not", () => {
    const ok = goldenAnswerOf({ ...card, validated_by: "Test tutor" });
    expect(Either.isRight(decode(ok))).toBe(true);
    expect(Either.isRight(decode({ ...ok, validatedOn: "2026-09-26" }))).toBe(true);
    expect(Either.isLeft(decode({ ...ok, validatedOn: "26/09/2026" }))).toBe(true);
    expect(Either.isLeft(decode({ ...ok, caseId: "zz" }))).toBe(true);
  });

  it("lays saved answers over the sheet, and round-trips a card", () => {
    const saved = goldenAnswerOf({
      ...card,
      expected: "zz-tutor",
      validated_by: "Test tutor",
      validated_on: "2026-09-26",
      irregular: true,
      note: "zz note",
    });
    const other: GoldenCase = { ...card, lemma: "zz-other" };
    const [first, second] = applyGoldenAnswers([card, other], [saved]);
    expect(first).toMatchObject({
      expected: "zz-tutor",
      validated_by: "Test tutor",
      validated_on: "2026-09-26",
      irregular: true,
      note: "zz note",
    });
    expect(second).toEqual(other);
    expect(goldenAnswerOf(first as GoldenCase)).toEqual(saved);
  });
});

describe("goldenPullSkip", () => {
  it("takes a locative as the tutor wrote it, in any class, but not two forms at once", () => {
    for (const cls of ["1", "1a", "2a", "6", "9"] as const)
      expect(goldenPullSkip({ lemma: "zz", class: cls, form: "locative" }, "", "zz-a")).toBeNull();
    expect(goldenPullSkip({ lemma: "zz", class: "9", form: "locative" }, "", "zz-a/zz-b")).toBe(
      "several_forms",
    );
  });
  it("takes the plural of every singular class, and nothing else", () => {
    for (const cls of ["1", "1a", "3", "5", "7", "9"] as const)
      expect(goldenPullSkip({ lemma: "zz", class: cls, form: "plural" })).toBeNull();
    for (const cls of ["2", "2a", "4", "6", "8", "10"] as const)
      expect(goldenPullSkip({ lemma: "zz", class: cls, form: "plural" })).toBe(
        "plural_of_a_plural",
      );
    expect(goldenPullSkip({ lemma: "isiXhosa", class: "7", form: "plural" })).toBe(
      "plural_of_a_plural",
    );
    for (const form of ["subject_concord", "object_concord", "possessive"] as const)
      expect(goldenPullSkip({ lemma: "zz", class: "1", form })).toBe("concord_before_frames");
  });
  it("takes a concord only when it was answered through a sentence frame", () => {
    // TEST FIXTURE: placeholders, not isiXhosa.
    const framed = "Sentence: zz yy xx (agreement: yy)\nclass 1";
    for (const form of ["subject_concord", "object_concord", "possessive"] as const) {
      expect(goldenPullSkip({ lemma: "zz", class: "1", form }, framed)).toBeNull();
      expect(goldenPullSkip({ lemma: "zz", class: "1", form }, "class 1")).toBe(
        "concord_before_frames",
      );
    }
    // A frame note does not let a plural of a plural through.
    expect(goldenPullSkip({ lemma: "zz", class: "2", form: "plural" }, framed)).toBe(
      "plural_of_a_plural",
    );
  });
  it("takes the singular of every plural class, and refuses the singular of a singular", () => {
    for (const cls of ["2", "2a", "4", "6", "8", "10"] as const)
      expect(goldenPullSkip({ lemma: "zz", class: cls, form: "singular" })).toBeNull();
    for (const cls of ["1", "1a", "3", "5", "7", "9"] as const)
      expect(goldenPullSkip({ lemma: "zz", class: cls, form: "singular" })).toBe(
        "singular_of_a_singular",
      );
  });
  it("pairs every class with exactly one other", () => {
    for (const cls of GOLDEN_CLASSES) expect(goldenOtherClass(goldenOtherClass(cls))).toBe(cls);
    expect(goldenPairOf("2a")).toEqual(["1a", "2a"]);
  });
});

describe("an answer with two forms in it", () => {
  it("is held back until the tutor picks one", () => {
    for (const answer of ["zz-one/ zz-two", "zz-one, zz-two", "zz-one; zz-two", "zz-one or zz-two"])
      expect(goldenPullSkip({ lemma: "zz", class: "9", form: "plural" }, "", answer)).toBe(
        "several_forms",
      );
    expect(goldenPullSkip({ lemma: "zz", class: "9", form: "plural" }, "", "zz-one")).toBeNull();
    // A structural reason wins: a plural-of-a-plural card stays that.
    expect(goldenPullSkip({ lemma: "zz", class: "2", form: "plural" }, "", "a/b")).toBe(
      "plural_of_a_plural",
    );
  });
});
