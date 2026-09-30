import { describe, expect, it } from "vitest";

import {
  parseCultureCards,
  placeholdersIn,
  renderCultureCard,
  type CultureCardSpec,
} from "./culture-cards.ts";
import { tapDistractors } from "./curate.ts";
import { loadCultureCards, loadCurriculum, loadSentenceRequests } from "./curriculum/files.ts";
import { parseSentenceRequests, resolveRequestWords } from "./sentence-requests.ts";

/**
 * The two files a tutor session is built from, and the rules that keep a
 * model's words out of the isiXhosa. Fixture lemmas are `zz-`: nothing here
 * claims anything about the language.
 */
const lexicon = [
  { id: "a", lemma: "zz-alpha", pos: "noun" },
  { id: "b", lemma: "zz-beta", pos: "verb" },
  { id: "c1", lemma: "zz-twin", pos: "interj" },
  { id: "c2", lemma: "zz-twin", pos: "adv" },
  { id: "d", lemma: "longword", pos: "noun" },
];

describe("sentence requests", () => {
  it("resolves words verbatim and reports the rest instead of guessing", () => {
    const r = resolveRequestWords(["zz-alpha", "zz-alph", "zz-twin"], lexicon, new Set());
    expect(r.lexemeIds).toEqual(["a"]);
    expect(r.rejected).toEqual([
      { word: "zz-alph", reason: "not_in_lexicon" },
      { word: "zz-twin", reason: "ambiguous" },
    ]);
  });

  it("settles an ambiguous lemma by part of speech or by what the skill teaches", () => {
    expect(resolveRequestWords(["zz-twin:adv"], lexicon, new Set()).lexemeIds).toEqual(["c2"]);
    const taught = resolveRequestWords(["zz-twin"], lexicon, new Set(["c1"]));
    expect(taught.lexemeIds).toEqual(["c1"]);
    expect(taught.outsideSkill).toEqual([]);
    expect(resolveRequestWords(["zz-beta"], lexicon, new Set(["a"])).outsideSkill).toEqual([
      "zz-beta",
    ]);
  });

  it("refuses a request with no English, no Norwegian or a duplicate slug", () => {
    const base = {
      unitSlug: "u",
      skillSlug: "s",
      slug: "x",
      order: 1,
      en: "Hi",
      nb: "Hei",
      words: [],
    };
    const file = (requests: unknown[]) => JSON.stringify({ header: [], version: 1, requests });
    expect(() => parseSentenceRequests(file([{ ...base, en: " " }]))).toThrow(/no English/);
    expect(() => parseSentenceRequests(file([{ ...base, nb: "" }]))).toThrow(/no Norwegian/);
    expect(() => parseSentenceRequests(file([base, base]))).toThrow(/twice/);
    expect(parseSentenceRequests(file([base])).requests).toHaveLength(1);
  });

  it("the distractors are the skill's other words, in order, at most four", () => {
    expect(tapDistractors(["a", "b", "c", "d", "e", "f"], ["b"])).toEqual(["a", "c", "d", "e"]);
    expect(tapDistractors(["a", "a", "b"], [])).toEqual(["a", "b"]);
  });
});

describe("culture cards", () => {
  const card: CultureCardSpec = {
    slug: "zz-card",
    unitSlug: "u",
    skillSlug: "s",
    order: 1,
    words: ["zz-alpha", "zz-twin:adv"],
    caveat: "1. A claim.",
    title: { en: "About {zz-alpha}", nb: "Om {zz-alpha}" },
    body: {
      en: "{zz-alpha} and {zz-twin:adv}, and a longword.",
      nb: "{zz-alpha} og {zz-twin:adv}.",
    },
  };

  it("fills every placeholder from the lexicon, verbatim", () => {
    const r = renderCultureCard(card, lexicon);
    if (!r.ok) throw new Error("refused");
    expect(r.card.payload.body.en).toBe("zz-alpha and zz-twin, and a longword.");
    expect(r.card.payload.title.nb).toBe("Om zz-alpha");
    expect(r.card.payload.lexemeIds).toEqual(["a", "c2"]);
  });

  it("refuses the whole card when a word is not in the lexicon", () => {
    const r = renderCultureCard({ ...card, words: [...card.words, "zz-nowhere"] }, lexicon);
    expect(r).toEqual({ ok: false, missing: ["zz-nowhere"] });
  });

  it("reports a lexicon word written into the prose outside a placeholder", () => {
    const r = renderCultureCard(card, lexicon);
    if (!r.ok) throw new Error("refused");
    expect(r.card.strayWords).toEqual([{ lang: "en", word: "longword" }]);
  });

  it("refuses a card with no caveat, an undeclared placeholder or a stray brace", () => {
    const file = (cards: unknown[]) => JSON.stringify({ header: [], version: 1, cards });
    expect(() => parseCultureCards(file([{ ...card, caveat: "" }]))).toThrow(/no caveat/);
    expect(() =>
      parseCultureCards(file([{ ...card, body: { ...card.body, en: "{zz-beta}" } }])),
    ).toThrow(/not in its words/);
    expect(() =>
      parseCultureCards(file([{ ...card, body: { ...card.body, nb: "a } b" } }])),
    ).toThrow(/unmatched brace/);
    expect(placeholdersIn("{a} x {b:c}")).toEqual(["a", "b:c"]);
  });
});

describe("the checked-in files", () => {
  const { spine } = loadCurriculum();
  const skills = new Set(spine.units.flatMap((u) => u.skills.map((s) => `${u.slug}/${s.slug}`)));

  it("every request names a skill the spine has, and greet-and-introduce gets four to nine each", () => {
    const { requests } = loadSentenceRequests();
    for (const r of requests) expect(skills).toContain(`${r.unitSlug}/${r.skillSlug}`);
    const first = spine.units.find((u) => u.slug === "greet-and-introduce");
    for (const s of first?.skills ?? []) {
      const n = requests.filter(
        (r) => r.unitSlug === "greet-and-introduce" && r.skillSlug === s.slug,
      ).length;
      expect(n, s.slug).toBeGreaterThanOrEqual(4);
      expect(n, s.slug).toBeLessThanOrEqual(9);
    }
  });

  it("every culture card names a skill the spine has, and every unit has at least one", () => {
    const { cards } = loadCultureCards();
    for (const c of cards) expect(skills).toContain(`${c.unitSlug}/${c.skillSlug}`);
    for (const u of spine.units)
      expect(
        cards.some((c) => c.unitSlug === u.slug),
        u.slug,
      ).toBe(true);
    const greet = cards.filter((c) => c.unitSlug === "greet-and-introduce").length;
    expect(greet).toBeGreaterThanOrEqual(3);
    expect(greet).toBeLessThanOrEqual(5);
  });

  it("a culture card's isiXhosa is only ever a declared placeholder", () => {
    // The loader fills placeholders from the lexicon; a card may not smuggle a
    // lemma into the prose by writing it out. The declared words are the only
    // lexicon strings the prose may contain, and only inside braces.
    for (const c of loadCultureCards().cards) {
      for (const lang of ["en", "nb"] as const) {
        const prose = `${c.title[lang]} ${c.body[lang]}`.replace(/\{[^{}]+\}/g, " ");
        for (const w of c.words) {
          const lemma = w.split(":")[0] as string;
          expect(prose.includes(lemma), `${c.slug} (${lang}) writes ${lemma} out`).toBe(false);
        }
      }
    }
  });
});
