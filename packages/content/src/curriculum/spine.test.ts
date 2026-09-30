/**
 * The shipped `curriculum/*.json` files, held to their contract.
 *
 * These are editor-facing data files, so the failure mode to protect against
 * is an editor's edit that the CLI would only notice at 3am against a
 * database. Everything here runs in the fast unit project.
 */

import en from "@molo/i18n/locales/en" with { type: "json" };
import nb from "@molo/i18n/locales/nb" with { type: "json" };
import { describe, expect, it } from "vitest";

import { loadCurriculum } from "./files.ts";
import { spineOrder, validateSpine } from "./spine.ts";
import { themeVeto } from "./themes.ts";

const { spine, themes } = loadCurriculum();

function lookup(bundle: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((acc, part) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, bundle);
}

describe("curriculum/spine.json", () => {
  it("decodes and satisfies the structural rules", () => {
    expect(validateSpine(spine, themes)).toEqual([]);
  });

  it("says in its own header that it is a proposal", () => {
    expect(spine.header.join(" ")).toMatch(/PROPOSAL/);
    expect(themes.header.join(" ")).toMatch(/PROPOSAL/);
  });

  it("runs from A1 to A2 without going backwards", () => {
    const bands = [...spine.units].sort((a, b) => a.order - b.order).map((u) => u.cefrBand);
    const rank: Record<string, number> = { A1: 1, A2: 2, B1: 3 };
    for (let i = 1; i < bands.length; i++) {
      expect(rank[bands[i] ?? "A1"] ?? 0).toBeGreaterThanOrEqual(rank[bands[i - 1] ?? "A1"] ?? 0);
    }
  });

  it("has every title key in both languages, with the same words as the file", () => {
    for (const { unit, skill } of spineOrder(spine)) {
      for (const [lang, bundle] of [
        ["en", en],
        ["nb", nb],
      ] as const) {
        expect(lookup(bundle, unit.titleKey), `${unit.titleKey} (${lang})`).toBe(unit.title[lang]);
        expect(lookup(bundle, skill.titleKey), `${skill.titleKey} (${lang})`).toBe(
          skill.title[lang],
        );
      }
    }
  });

  it("names a situation, not a vocabulary field", () => {
    // A can-do title starts with a verb. Not a rule a machine can really
    // check, but "Food vocabulary" fails it and "Order food and drink" passes.
    for (const unit of spine.units) {
      expect(unit.title.en, unit.slug).toMatch(/^[A-Z][a-z]+( |$)/);
      expect(unit.title.en, unit.slug).not.toMatch(/vocabulary|words$/i);
    }
  });

  it("contains no isiXhosa in any learner-facing title", () => {
    // The grammar notes quote isiXhosa on purpose; the titles must not, because
    // a title is copy and copy is never written by an agent in the target
    // language (the project rules, non-negotiable 1).
    for (const { unit, skill } of spineOrder(spine)) {
      for (const t of [unit.title.en, unit.title.nb, skill.title.en, skill.title.nb]) {
        expect(t, t).not.toMatch(/\b(?:umntu|molo|ndi|isiXhosa)\b/);
      }
    }
  });
});

describe("curriculum/themes.json", () => {
  it("gives every skill a theme and leaves none unused", () => {
    const used = new Set(spineOrder(spine).map((p) => p.skill.theme));
    expect(Object.keys(themes.themes).toSorted()).toEqual([...used].toSorted());
  });

  it("gives every theme some way to match a word", () => {
    for (const [name, theme] of Object.entries(themes.themes)) {
      const ways = theme.senses.length + theme.keywords.length + (theme.lemmaPatterns?.length ?? 0);
      expect(ways, `theme ${name} matches nothing`).toBeGreaterThan(0);
    }
  });

  it("compiles every lemma pattern", () => {
    for (const [name, theme] of Object.entries(themes.themes)) {
      for (const p of theme.lemmaPatterns ?? []) {
        expect(() => new RegExp(p, "i"), `${name}: ${p}`).not.toThrow();
      }
    }
  });

  it("keeps off-topic dictionary senses out of Unit 1 (the relevance guard)", () => {
    // The English glosses the matcher once put in greet-and-introduce by the
    // wrong sense. Lemmas are placeholders: only the gloss and the lemma's
    // shape are judged, never isiXhosa.
    const clicks = themes.themes["clicks"]!;
    const identity = themes.themes["identity"]!;
    for (const [lemma, gloss] of [
      ["zz-a", "employers"],
      ["zz-one zz-two /zz-three", "Legs"],
      ["zz-b", "faculties; departments"],
      ["zz-c zz-d", "paediatric wards"],
      ["zz-c zz-e", "orthopaedic wards"],
      ["zz-c zz-f", "trauma units"],
      ["zz-c zz-g", "x-ray sections"],
      ["zz-h", "sides; sections"],
    ] as const) {
      expect(themeVeto(clicks, { lemma, glosses: [gloss] }), gloss).not.toBeNull();
    }
    expect(themeVeto(identity, { lemma: "zz-i", glosses: ["homesteads"] })).not.toBeNull();
    // ...and still takes an ordinary single word.
    expect(themeVeto(clicks, { lemma: "zz-j", glosses: ["spoons"] })).toBeNull();
    expect(themeVeto(identity, { lemma: "zz-k", glosses: ["homestead"] })).toBeNull();
  });

  it("keeps maths and statistics terms out of Units 7 and 8", () => {
    // The glosses that brought the corpora's maths terms in.
    // Lemmas are placeholders: only the gloss and the lemma's shape count.
    const relatives = themes.themes["relatives"]!;
    const shopping = themes.themes["shopping"]!;
    const quantity = themes.themes["quantity"]!;
    expect(themeVeto(relatives, { lemma: "zz-a", glosses: ["Integral"] })).not.toBeNull();
    expect(themeVeto(relatives, { lemma: "zz-b", glosses: ["Probability"] })).not.toBeNull();
    expect(themeVeto(shopping, { lemma: "zz-c zz-d", glosses: ["product"] })).not.toBeNull();
    expect(themeVeto(shopping, { lemma: "zz-e", glosses: ["sample size"] })).not.toBeNull();
    expect(
      themeVeto(quantity, { lemma: "zz-f", glosses: ["Least common multiple"] }),
    ).not.toBeNull();
    expect(themeVeto(quantity, { lemma: "zz-g", glosses: ["Least Squares"] })).not.toBeNull();
    // ...and still take an ordinary word.
    expect(themeVeto(shopping, { lemma: "zz-h", glosses: ["buy"] })).toBeNull();
    expect(themeVeto(quantity, { lemma: "zz-i", glosses: ["only"] })).toBeNull();
  });

  it("opens the click skill on sets A and B, and only a pronunciation skill has sets", () => {
    const skills = spineOrder(spine).map((p) => p.skill);
    expect(skills.find((s) => s.slug === "hear-the-three-clicks")?.clickIdentifySets).toEqual([
      "A",
      "B",
    ]);
    for (const s of skills) if (s.clickIdentifySets) expect(s.kind, s.slug).toBe("pronunciation");
  });

  it("contains no isiXhosa words as keywords", () => {
    // Keywords match English glosses. An isiXhosa keyword would silently match
    // nothing, which is the kind of quiet failure this file must not have.
    for (const [name, theme] of Object.entries(themes.themes)) {
      for (const k of theme.keywords) {
        expect(k, `${name}: ${k}`).toMatch(/^[A-Za-z][A-Za-z '-]*$/);
      }
    }
  });
});
