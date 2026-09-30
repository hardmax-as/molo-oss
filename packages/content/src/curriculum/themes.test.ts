import { describe, expect, it } from "vitest";

import { parseThemes, type ThemeMap } from "./spine.ts";
import { assignTheme, containsPhrase, lemmaWordCount, matchThemes, themeVeto } from "./themes.ts";

const themes: ThemeMap = parseThemes({
  header: ["PROPOSAL"],
  version: 1,
  themes: {
    food: {
      note: "food",
      senses: ["meat"],
      keywords: ["meat", "bread", "car"],
      exclude: ["meat market index"],
    },
    transport: {
      note: "transport",
      senses: [],
      keywords: ["car", "drive"],
      exclude: [],
    },
    clicks: {
      note: "clicks",
      senses: [],
      keywords: [],
      lemmaPatterns: ["[cxq]"],
      pos: ["noun"],
      exclude: [],
    },
  },
});

// food comes before transport, transport before clicks.
const ORDER = ["food", "transport", "clicks"];

const word = (lemma: string, pos: string, glosses: string[], corpusSenses: string[] = []) => ({
  id: lemma,
  lemma,
  pos,
  glosses,
  corpusSenses,
});

describe("whole-phrase matching", () => {
  it("matches a word on its own", () => {
    expect(containsPhrase("a red car", "car")).toBe(true);
  });

  it("does not match inside a longer word", () => {
    expect(containsPhrase("carry a box", "car")).toBe(false);
    expect(containsPhrase("this year", "ear")).toBe(false);
  });

  it("matches a multi-word phrase", () => {
    expect(containsPhrase("say good morning", "good morning")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(containsPhrase("Meat", "meat")).toBe(true);
  });
});

describe("theme assignment", () => {
  it("prefers the corpus's own sense over a keyword", () => {
    // "car" would put this in transport on a keyword; the corpus says the
    // token meant "meat", and that wins.
    const matches = matchThemes(word("inyama", "noun", ["car"], ["meat"]), themes, ORDER);
    expect(matches[0]?.theme).toBe("food");
    expect(matches[0]?.rule).toBe("sense");
    expect(matches[0]?.evidence).toBe(3);
  });

  it("breaks a keyword tie by which skill comes first", () => {
    const matches = matchThemes(word("imoto", "noun", ["car"]), themes, ORDER);
    expect(matches.map((m) => m.theme)).toEqual(["food", "transport"]);
    expect(assignTheme(word("imoto", "noun", ["car"]), themes, ORDER)?.theme).toBe("food");
  });

  it("lets an exclude veto a theme outright", () => {
    const w = word("x", "noun", ["meat market index"]);
    expect(matchThemes(w, themes, ORDER).map((m) => m.theme)).not.toContain("food");
  });

  it("honours a theme's part-of-speech restriction", () => {
    expect(assignTheme(word("cela", "verb", ["ask"]), themes, ORDER)).toBeNull();
    expect(assignTheme(word("icango", "noun", ["door"]), themes, ORDER)?.theme).toBe("clicks");
  });

  it("reports the exact line that fired, so a report can justify the choice", () => {
    const m = assignTheme(word("isonka", "noun", ["bread"]), themes, ORDER);
    expect(m).toEqual({ theme: "food", evidence: 2, rule: "keyword", matched: "bread" });
  });

  it("returns null rather than guessing when nothing matches", () => {
    expect(assignTheme(word("into", "noun", ["thing"]), themes, ORDER)).toBeNull();
  });
});

describe("the relevance guard", () => {
  const guarded: ThemeMap = parseThemes({
    header: ["PROPOSAL"],
    version: 1,
    themes: {
      clicks: {
        note: "clicks",
        senses: [],
        keywords: [],
        lemmaPatterns: ["[cxq]"],
        exclude: ["wards"],
        maxLemmaWords: 1,
      },
    },
  });
  const clicks = guarded.themes["clicks"]!;

  it("counts words on spaces and slashes", () => {
    expect(lemmaWordCount("zzc")).toBe(1);
    expect(lemmaWordCount("zzc zzq")).toBe(2);
    expect(lemmaWordCount("zzc /zz-q zzx")).toBe(3);
  });

  it("refuses a phrase and an excluded gloss, and says why", () => {
    expect(themeVeto(clicks, { lemma: "zzc zzx", glosses: ["x"] })).toMatch(/more than 1 word/);
    expect(themeVeto(clicks, { lemma: "zzc", glosses: ["paediatric wards"] })).toMatch(/wards/);
    expect(themeVeto(clicks, { lemma: "zzc", glosses: ["spoon"] })).toBeNull();
  });

  it("keeps a vetoed word out of the theme however it would have matched", () => {
    const w = { id: "p", lemma: "zzc zzq", pos: "noun", glosses: ["legs"], corpusSenses: [] };
    expect(matchThemes(w, guarded, ["clicks"])).toEqual([]);
  });
});
