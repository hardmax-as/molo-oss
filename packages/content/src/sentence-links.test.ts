import { describe, expect, it } from "vitest";

import { buildLexiconIndex, type MatchableLexeme } from "./lexicon-match.ts";
import { planSentenceLinks, sentenceWords } from "./sentence-links.ts";

// Placeholder words only: the planner copies what it is given, and a test
// must not look like isiXhosa anyone could learn from.
const lx = (id: string, lemma: string, extra: Partial<MatchableLexeme> = {}): MatchableLexeme => ({
  id,
  lemma,
  pos: "verb",
  nounClassLabel: null,
  infinitive: null,
  glosses: [],
  ...extra,
});

const index = buildLexiconIndex([
  lx("greet", "zzgreet"),
  lx("thanks", "zzthanks", { pos: "interjection" }),
  lx("go", "zzgo", { infinitive: "zzkuzzgo" }),
  lx("twin-a", "zztwin"),
  lx("twin-b", "zztwin"),
]);

describe("sentenceWords", () => {
  it("splits on space and trims punctuation from each end only", () => {
    expect(sentenceWords("  Zzgreet, zz-na zz'ku!  “zzthanks.” ")).toEqual([
      "Zzgreet",
      "zz-na",
      "zz'ku",
      "zzthanks",
    ]);
  });
});

describe("planSentenceLinks", () => {
  it("links exact lemmas as verified and keeps the tutor's own spelling", () => {
    const plan = planSentenceLinks("Zzgreet zzthanks.", index, []);
    expect(plan.tokens).toEqual([
      { position: 0, lexemeId: "greet", surfaceForm: "Zzgreet", isLemma: true },
      { position: 1, lexemeId: "thanks", surfaceForm: "zzthanks", isLemma: true },
    ]);
    expect(plan.unlinked).toEqual([]);
  });

  it("links an infinitive but does not call it the lemma", () => {
    const plan = planSentenceLinks("zzkuzzgo", index, []);
    expect(plan.tokens).toEqual([
      { position: 0, lexemeId: "go", surfaceForm: "zzkuzzgo", isLemma: false },
    ]);
  });

  it("links a shared form only when the request names exactly one of the lexemes", () => {
    expect(planSentenceLinks("zztwin", index, []).ambiguous).toEqual([
      { word: "zztwin", lexemeIds: ["twin-a", "twin-b"] },
    ]);
    expect(planSentenceLinks("zztwin", index, ["twin-b"]).tokens[0]?.lexemeId).toBe("twin-b");
  });

  it("never links an inflected word; it hints at the requested word inside it", () => {
    const plan = planSentenceLinks("ndizzgreetile zzthanks", index, ["greet", "go"]);
    expect(plan.tokens.map((t) => t.lexemeId)).toEqual(["thanks"]);
    expect(plan.unlinked).toEqual([{ word: "ndizzgreetile", hints: ["zzgreet"] }]);
    expect(plan.targetsUnused).toEqual(["zzgreet", "zzgo"]);
  });
});
