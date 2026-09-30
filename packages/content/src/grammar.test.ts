import { describe, expect, it } from "vitest";

import { resolveCell, resolveNote, type MorphSource, type RuleTable } from "./grammar.ts";

/**
 * A stand-in for the WASM build with the two classes the tests need. The
 * shape is the real `rule_table_json()` shape; the values are the real
 * table's, which is the point — the resolver must not need anything the
 * generator does not already publish.
 */
const table: RuleTable = {
  class: [
    { label: "1", strip: ["um-"], plural: "2", validated: false },
    { label: "2", strip: ["aba-"], validated: false },
    { label: "9", strip: ["i-"], plural: "10", validated: false },
  ],
};

const morph: MorphSource = {
  ruleTable: () => table,
  generate(lemma, cls, form) {
    if (form === "subject_concord") return cls === "1" ? "u-" : "i-";
    if (form === "plural") {
      if (lemma === "umntu" && cls === "1") return "abantu";
      if (lemma === "inja" && cls === "9") return "izinja";
      throw new Error(`class ${cls} has no plural pairing in the rule table`);
    }
    throw new Error(`unknown form ${form}`);
  },
};

const umntu = { id: "lex-1", lemma: "umntu", nounClass: "1" };

const spec = {
  role: "paradigm" as const,
  order: 1,
  rowLabel: "1",
  colKey: "word",
  lemma: "umntu",
  nounClass: "1",
  form: "lemma" as const,
};

describe("resolveCell", () => {
  it("takes a citation form from the lexicon verbatim", () => {
    const r = resolveCell(spec, { lexeme: umntu, morph });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cell.surfaceForm).toBe("umntu");
    expect(r.cell.lexemeId).toBe("lex-1");
  });

  it("splits it only at a boundary the rule table itself declares", () => {
    const r = resolveCell(spec, { lexeme: umntu, morph });
    expect(r.ok && r.cell.morphemes).toEqual(["um", "ntu"]);
  });

  it("emits no split when the declared prefix does not actually start the lemma", () => {
    const r = resolveCell(
      { ...spec, lemma: "zzsomething", nounClass: "1" },
      { lexeme: { id: "lex-x", lemma: "zzsomething", nounClass: "1" }, morph },
    );
    expect(r.ok && r.cell.morphemes).toEqual([]);
  });

  it("drops a cell whose lemma is not in the lexicon rather than approximating it", () => {
    const r = resolveCell(spec, { lexeme: null, morph });
    expect(r).toMatchObject({ ok: false, reason: "lexeme_missing" });
  });

  it("drops a cell whose lexeme is in another class", () => {
    const r = resolveCell(spec, { lexeme: { ...umntu, nounClass: "3" }, morph });
    expect(r).toMatchObject({ ok: false, reason: "class_mismatch" });
  });

  it("takes an inflected form from the generator and splits it by containment", () => {
    const r = resolveCell({ ...spec, form: "plural" }, { lexeme: umntu, morph });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cell.surfaceForm).toBe("abantu");
    expect(r.cell.morphemes).toEqual(["aba", "ntu"]);
  });

  it("drops a cell the generator refuses instead of composing one", () => {
    const r = resolveCell(
      { ...spec, lemma: "abantu", nounClass: "2", form: "plural" },
      { lexeme: { id: "lex-2", lemma: "abantu", nounClass: "2" }, morph },
    );
    expect(r).toMatchObject({ ok: false, reason: "morph_refused" });
  });

  it("keeps a concord as one morpheme, marker and all", () => {
    const r = resolveCell({ ...spec, form: "subject_concord" }, { lexeme: umntu, morph });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cell.surfaceForm).toBe("u-");
    expect(r.cell.morphemes).toEqual(["u-"]);
  });
});

describe("resolveNote", () => {
  const note = {
    slug: "zz-note",
    unitSlug: "zz-unit",
    skillSlug: "zz-skill",
    order: 1,
    caveat: "fixture",
    bodies: {
      en: { title: "t", rule: "r" },
      nb: { title: "t", rule: "r" },
    },
    cells: [
      { ...spec, order: 1 },
      { ...spec, order: 2, lemma: "zz-absent" },
      { ...spec, order: 3, form: "plural" as const },
    ],
  };

  it("keeps what it can prove and reports what it dropped", () => {
    const r = resolveNote(note, {
      morph,
      lexemeFor: (lemma) => (lemma === "umntu" ? umntu : null),
    });
    expect(r.cells.map((c) => c.surfaceForm)).toEqual(["umntu", "abantu"]);
    expect(r.rejected).toEqual([
      { reason: "lexeme_missing", detail: "zz-absent is not in the lexicon" },
    ]);
  });
});
