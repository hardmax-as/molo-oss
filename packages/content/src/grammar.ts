/**
 * Turning `curriculum/grammar-notes.json` into rows.
 *
 * ## The rule this module exists to enforce
 *
 * A grammar note's *explanation* is English and Norwegian written by a model
 * and stored as `ai_draft`. Its *isiXhosa* is not written by anybody. Every
 * cell is specified as a reference — a lemma, its class, and which form is
 * wanted — and resolved here against two sources and no others:
 *
 *   1. **The lexicon**, for a citation form. The lemma must exist verbatim
 *      and its class must match the one the specification claims. A cell
 *      whose lemma is not in the lexicon is dropped, never approximated.
 *   2. **`xh-morph`**, for an inflected form or a concord. Whatever
 *      `generate()` answers is the form; if it refuses, the cell is dropped.
 *
 * There is deliberately no third branch. Nothing here concatenates a prefix
 * onto a stem, and the one place a form is split into morphemes proves the
 * split by string containment before it emits one, so a segmentation that
 * does not hold is simply absent rather than guessed.
 *
 * ## What the caller still has to know
 *
 * `xh-morph` generates from a rule table in which every class is
 * `validated = false` (docs/GRAMMAR.md section 4). The forms below are
 * therefore *consistent with the table*, not *known to be right*. That is
 * exactly why each note carries a `caveat` and enters at `ai_draft`.
 */

import { splitMorphemes, type GrammarCellRole } from "@molo/core";

/** The forms `xh-morph` can produce, plus the lexicon's own citation form. */
export const CELL_FORMS = [
  "lemma",
  "plural",
  "subject_concord",
  "object_concord",
  "possessive",
] as const;
export type CellForm = (typeof CELL_FORMS)[number];

export interface GrammarCellSpec {
  readonly role: GrammarCellRole;
  readonly order: number;
  readonly rowLabel?: string;
  readonly colKey: string;
  /** The lemma as it must appear in the lexicon, verbatim. */
  readonly lemma: string;
  /** The class the lexeme is expected to carry. A mismatch drops the cell. */
  readonly nounClass: string;
  readonly form: CellForm;
}

export interface GrammarBodySpec {
  readonly title: string;
  readonly rule: string;
  readonly correction?: string;
}

export interface GrammarNoteSpec {
  readonly slug: string;
  readonly unitSlug: string;
  readonly skillSlug: string;
  readonly order: number;
  readonly rowHeaderKey?: string;
  /** What a reviewing editor is being asked to validate about the claim. */
  readonly caveat: string;
  readonly bodies: { readonly en: GrammarBodySpec; readonly nb: GrammarBodySpec };
  readonly cells: readonly GrammarCellSpec[];
}

export interface GrammarNotesFile {
  readonly header: readonly string[];
  readonly version: number;
  readonly notes: readonly GrammarNoteSpec[];
}

/** A lexicon row as the resolver needs it. */
export interface LexemeFact {
  readonly id: string;
  readonly lemma: string;
  readonly nounClass: string | null;
}

/** Just enough of `xh-morph` to resolve a cell; the CLI hands in the WASM build. */
export interface MorphSource {
  generate(lemma: string, cls: string, form: string): string;
  /** `rule_table_json()`, parsed. Used only to read a class's declared prefixes. */
  ruleTable(): RuleTable;
}

export interface RuleTable {
  readonly class: ReadonlyArray<{
    readonly label: string;
    readonly strip?: readonly string[];
    readonly plural?: string;
    readonly validated?: boolean;
  }>;
}

export const CELL_REJECT_REASONS = ["lexeme_missing", "class_mismatch", "morph_refused"] as const;
export type CellRejectReason = (typeof CELL_REJECT_REASONS)[number];

export interface ResolvedCell {
  readonly role: GrammarCellRole;
  readonly order: number;
  readonly rowLabel: string;
  readonly colKey: string;
  readonly surfaceForm: string;
  readonly morphemes: readonly string[];
  readonly lexemeId: string | null;
}

export type CellResult =
  | { readonly ok: true; readonly cell: ResolvedCell }
  | { readonly ok: false; readonly reason: CellRejectReason; readonly detail: string };

/**
 * The prefixes a class declares in the rule table, hyphens dropped. This is
 * the generator's own data, read rather than reimplemented: nothing here
 * decides what a prefix is, it only asks the table what it already says.
 */
function declaredPrefixes(table: RuleTable, label: string): string[] {
  const cls = table.class.find((c) => c.label === label);
  return (cls?.strip ?? []).map((p) => p.replaceAll("-", "")).filter((p) => p !== "");
}

/**
 * The stem of a citation form, if the class's own declared prefix actually
 * starts it. Returns null when it does not — at which point no split is
 * emitted, because an unproven split is a claim.
 */
function stemOf(
  table: RuleTable,
  lemma: string,
  label: string,
): { prefix: string; stem: string } | null {
  for (const p of declaredPrefixes(table, label)) {
    if (lemma.startsWith(p) && lemma.length > p.length) {
      return { prefix: p, stem: lemma.slice(p.length) };
    }
  }
  return null;
}

/**
 * Morphemes for a generated plural, by containment only: the generator kept
 * the stem, so whatever precedes it is the plural prefix. No attach rule is
 * consulted and no string is composed.
 */
function pluralMorphemes(plural: string, stem: string): string[] {
  if (stem === "" || !plural.endsWith(stem) || plural.length <= stem.length) return [];
  return [plural.slice(0, plural.length - stem.length), stem];
}

/**
 * Resolves one cell against the lexicon and the generator.
 *
 * Everything this returns is either copied from a lexicon row or handed back
 * by `xh-morph`. The `morphemes` are the one derived value, and they are
 * derived by splitting a string the generator produced at a boundary the
 * rule table itself declares — never by joining two strings together.
 */
export function resolveCell(
  spec: GrammarCellSpec,
  deps: { readonly lexeme: LexemeFact | null; readonly morph: MorphSource },
): CellResult {
  const { lexeme } = deps;
  if (!lexeme) {
    return { ok: false, reason: "lexeme_missing", detail: `${spec.lemma} is not in the lexicon` };
  }
  if (lexeme.nounClass !== spec.nounClass) {
    return {
      ok: false,
      reason: "class_mismatch",
      detail: `${spec.lemma} is class ${lexeme.nounClass ?? "none"}, not ${spec.nounClass}`,
    };
  }
  const table = deps.morph.ruleTable();
  const base = {
    role: spec.role,
    order: spec.order,
    rowLabel: spec.rowLabel ?? "",
    colKey: spec.colKey,
    lexemeId: lexeme.id,
  };

  if (spec.form === "lemma") {
    const split = stemOf(table, lexeme.lemma, spec.nounClass);
    return {
      ok: true,
      cell: {
        ...base,
        surfaceForm: lexeme.lemma,
        morphemes: split ? [split.prefix, split.stem] : [],
      },
    };
  }

  let surface: string;
  try {
    surface = deps.morph.generate(lexeme.lemma, spec.nounClass, spec.form);
  } catch (e) {
    return {
      ok: false,
      reason: "morph_refused",
      detail: `${spec.lemma} ${spec.nounClass} ${spec.form}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (spec.form === "plural") {
    const split = stemOf(table, lexeme.lemma, spec.nounClass);
    return {
      ok: true,
      cell: {
        ...base,
        surfaceForm: surface,
        morphemes: split ? pluralMorphemes(surface, split.stem) : [],
      },
      // A generated plural is not the lexeme's own citation form, so the cell
      // does not claim to be that lexeme; the reference is kept for the gate.
    };
  }

  // A concord is one morpheme, and the generator already writes the boundary
  // marker on it (`u-`, `-m-`). Splitting it would invent a second part.
  return {
    ok: true,
    cell: {
      ...base,
      surfaceForm: surface,
      morphemes: splitMorphemes(surface).length > 1 ? splitMorphemes(surface) : [surface],
    },
  };
}

export interface ResolvedNote {
  readonly spec: GrammarNoteSpec;
  readonly cells: readonly ResolvedCell[];
  readonly rejected: ReadonlyArray<{ readonly reason: CellRejectReason; readonly detail: string }>;
}

/** Resolves a whole note. A note that loses every worked-example cell is still returned; the gate refuses it. */
export function resolveNote(
  spec: GrammarNoteSpec,
  deps: {
    readonly lexemeFor: (lemma: string, nounClass: string) => LexemeFact | null;
    readonly morph: MorphSource;
  },
): ResolvedNote {
  const cells: ResolvedCell[] = [];
  const rejected: Array<{ reason: CellRejectReason; detail: string }> = [];
  for (const c of [...spec.cells].sort((a, b) => a.order - b.order)) {
    const r = resolveCell(c, { lexeme: deps.lexemeFor(c.lemma, c.nounClass), morph: deps.morph });
    if (r.ok) cells.push(r.cell);
    else rejected.push({ reason: r.reason, detail: r.detail });
  }
  return { spec, cells, rejected };
}

/** Reads and shallowly validates the file; a bad shape fails loudly rather than half-loading. */
export function parseGrammarNotes(json: string): GrammarNotesFile {
  const raw = JSON.parse(json) as GrammarNotesFile;
  if (!Array.isArray(raw.notes)) throw new Error("grammar-notes.json: `notes` must be an array");
  for (const n of raw.notes) {
    if (!n.slug || !n.skillSlug || !n.unitSlug) {
      throw new Error(`grammar-notes.json: a note is missing slug, unitSlug or skillSlug`);
    }
    if (!n.caveat?.trim()) {
      // Not optional. A note with no caveat tells its reviewer nothing about
      // what they are validating, which is the whole point of the row.
      throw new Error(`grammar-notes.json: note ${n.slug} has no caveat`);
    }
    for (const c of n.cells) {
      if (!(CELL_FORMS as readonly string[]).includes(c.form)) {
        throw new Error(`grammar-notes.json: note ${n.slug} asks for an unknown form ${c.form}`);
      }
    }
  }
  return raw;
}
