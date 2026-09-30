import { describe, expect, it } from "vitest";

import {
  buildLexiconIndex,
  matchForm,
  matchToken,
  rootsOf,
  type MatchableLexeme,
} from "./lexicon-match.ts";

const lex = (
  id: string,
  lemma: string,
  pos: string,
  nounClassLabel: string | null,
  glosses: string[],
  infinitive: string | null = null,
): MatchableLexeme => ({ id, lemma, pos, nounClassLabel, infinitive, glosses });

const LEXICON = [
  lex("tree", "umthi", "noun", "3", ["tree"]),
  lex("say", "thi", "verb", null, ["say"], "ukuthi"),
  lex("walk", "hamba", "verb", null, ["go", "walk"], "ukuhamba"),
  lex("child", "umntwana", "noun", "1", ["child"]),
  lex("year", "unyaka", "noun", "3", ["year"]),
  lex("no-adv", "hayi", "adv", null, ["not"]),
  lex("no-interj", "hayi", "interj", null, ["no"]),
];

const index = buildLexiconIndex(LEXICON);

const token = (normalized: string, segmented: string[], sense: string | null) => ({
  normalized,
  segmented,
  sense,
});

describe("roots", () => {
  it("strips the declared class prefix from a noun", () => {
    expect(rootsOf({ lemma: "umthi", pos: "noun", nounClassLabel: "3" })).toContain("thi");
  });

  it("does not strip a prefix the word's class does not declare", () => {
    // Class 9 strips i-, not um-: "imali" must not become "ali" by accident.
    expect(rootsOf({ lemma: "imali", pos: "noun", nounClassLabel: "9" })).toEqual([
      "imali",
      "mali",
    ]);
  });

  it("drops a verb's final vowel, which is what the corpus segments away", () => {
    expect(rootsOf({ lemma: "hamba", pos: "verb", nounClassLabel: null })).toContain("hamb");
  });
});

describe("matching corpus tokens", () => {
  it("matches an exact surface form", () => {
    expect(matchToken(index, token("Umthi", [], null))).toEqual(["tree"]);
  });

  it("matches an inflected token by root and the corpus's own sense", () => {
    // ngonyaka = nga-u-nyaka, sense "year"
    expect(matchToken(index, token("ngonyaka", ["nga", "u", "nyaka"], "year"))).toEqual(["year"]);
  });

  it("does not merge umthi 'tree' with thi 'say' on the root alone", () => {
    // The root of "umthi" is "thi", which is also the verb. Only the sense
    // keeps them apart, and the corpus supplies it.
    const asTree = matchToken(index, token("umthi", ["um", "thi"], "tree"));
    const asSay = matchToken(index, token("uthi", ["u", "thi"], "say"));
    expect(asTree).toEqual(["tree"]);
    expect(asSay).toEqual(["say"]);
  });

  it("refuses a root match when the corpus gives no sense", () => {
    expect(matchToken(index, token("bathi", ["ba", "thi"], null))).toEqual([]);
  });

  it("returns both rows when one form is two words in our lexicon", () => {
    expect([...matchToken(index, token("hayi", [], null))].sort()).toEqual(["no-adv", "no-interj"]);
  });

  it("matches nothing rather than guessing", () => {
    expect(matchToken(index, token("qwerty", ["qwerty"], "nonsense"))).toEqual([]);
  });
});

describe("matching a bare surface-form list", () => {
  it("matches a lemma", () => {
    expect(matchForm(index, "Hamba")).toEqual(["walk"]);
  });

  it("matches an infinitive to its verb", () => {
    expect(matchForm(index, "ukuhamba")).toEqual(["walk"]);
  });

  it("does not analyse morphology it was not given", () => {
    expect(matchForm(index, "ndiyahamba")).toEqual([]);
  });
});
