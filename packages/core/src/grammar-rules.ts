/**
 * The rules behind a grammar note (docs/GRAMMAR.md section 1) — when one
 * interrupts a lesson, how a flat list of cells becomes a table, and how a
 * word is split into its parts.
 *
 * Effect-free and structurally typed on purpose, the way `celebration.ts`
 * is: mobile's Jest suite runs these without pulling a schema library into a
 * React Native bundle. The boundary shapes they describe live in
 * `grammar.ts`, which re-exports everything here.
 */

/**
 * What a cell is for. The worked example comes before the rule (GRAMMAR.md:
 * "a short worked example, then the rule in a sentence or two"); the
 * paradigm cells are the table under it.
 */
export const GRAMMAR_CELL_ROLES = ["example", "paradigm"] as const;
export type GrammarCellRole = (typeof GRAMMAR_CELL_ROLES)[number];
/**
 * Column keys the clients know how to name in the learner's own language
 * (`grammar.columns.*` in `packages/i18n`). An editor may write any other
 * string, and a client that does not recognise it shows it verbatim —
 * which is right, because at that point it is content, not chrome.
 */
export const GRAMMAR_COLUMN_KEYS = [
  "class",
  "word",
  "gloss",
  "singular",
  "plural",
  "subjectConcord",
  "objectConcord",
  "possessive",
] as const;
export type GrammarColumnKey = (typeof GRAMMAR_COLUMN_KEYS)[number];

export function isKnownColumnKey(key: string): key is GrammarColumnKey {
  return (GRAMMAR_COLUMN_KEYS as readonly string[]).includes(key);
}

// ---------------------------------------------------------------------------
// Morphemes
// ---------------------------------------------------------------------------

/**
 * The corpus writes a token's morphemes hyphen-separated (`aba-ntu`), and
 * `packages/content/src/adapters/spoken-xhosa-gu.ts` splits on the same
 * character. This is the one place that agrees with it, so a cell filled
 * from the corpus and a cell filled from `xh-morph` render identically.
 *
 * Empty parts and the corpus's `_` placeholder are dropped; a string with
 * nothing in it yields no morphemes at all, which the components draw as an
 * unsplit word rather than as an empty row of boxes.
 */
export function splitMorphemes(segmented: string): string[] {
  return segmented
    .split("-")
    .map((p) => p.trim())
    .filter((p) => p !== "" && p !== "_");
}

/**
 * A boundary marker belongs to the morpheme it was written on, so a prefix
 * reads `aba-` and an infix `-m-`. `xh-morph` writes concords that way
 * already; a noun split into prefix and stem does not, so the joiner adds
 * the marker back for display and never for comparison.
 */
export function displayMorphemes(morphemes: readonly string[]): string[] {
  if (morphemes.length <= 1) return [...morphemes];
  return morphemes.map((m, i) => {
    const last = i === morphemes.length - 1;
    const hasLead = m.startsWith("-");
    const hasTail = m.endsWith("-");
    const lead = i > 0 && !hasLead ? "-" : "";
    const tail = !last && !hasTail ? "-" : "";
    return `${lead}${m}${tail}`;
  });
}

// ---------------------------------------------------------------------------
// A table, from a flat list of cells
// ---------------------------------------------------------------------------

/** The little a cell must have for the table to arrange it. */
export interface ParadigmCell {
  readonly role: string;
  readonly order: number;
  readonly rowLabel: string;
  readonly colKey: string;
}

export interface GrammarParadigm<T extends ParadigmCell = ParadigmCell> {
  /** Column keys in first-appearance order; this is the header row. */
  readonly columns: readonly string[];
  readonly rows: ReadonlyArray<{
    readonly label: string;
    /** One entry per column, in `columns` order; null where the note has no cell. */
    readonly cells: ReadonlyArray<T | null>;
  }>;
}

/**
 * The paradigm cells, arranged. Rows and columns keep the order the editor
 * gave them rather than being sorted, because a paradigm's order is part of
 * what it teaches. A row that is missing a column gets a null, which the
 * table draws as an empty cell instead of shifting the row left.
 */
export function paradigmOf<T extends ParadigmCell>(cells: readonly T[]): GrammarParadigm<T> {
  const ordered = [...cells].filter((c) => c.role === "paradigm").sort((a, b) => a.order - b.order);
  const columns: string[] = [];
  const rowOrder: string[] = [];
  const byRow = new Map<string, Map<string, T>>();
  for (const c of ordered) {
    if (!columns.includes(c.colKey)) columns.push(c.colKey);
    let row = byRow.get(c.rowLabel);
    if (!row) {
      row = new Map();
      byRow.set(c.rowLabel, row);
      rowOrder.push(c.rowLabel);
    }
    // First cell wins: a duplicate (row, column) is an editing mistake, and
    // silently overwriting would hide it.
    if (!row.has(c.colKey)) row.set(c.colKey, c);
  }
  return {
    columns,
    rows: rowOrder.map((label) => ({
      label,
      cells: columns.map((col) => byRow.get(label)?.get(col) ?? null),
    })),
  };
}

/** The worked example: the cells the editor marked `example`, in order. */
export function workedExampleOf<T extends { readonly role: string; readonly order: number }>(
  cells: readonly T[],
): T[] {
  return [...cells].filter((c) => c.role === "example").sort((a, b) => a.order - b.order);
}

// ---------------------------------------------------------------------------
// When a note interrupts a lesson
// ---------------------------------------------------------------------------

export interface GrammarNoteVisibility {
  /** One published note, or nothing. */
  readonly note: { readonly id: string } | null | undefined;
  /** Note ids this learner has already been shown and dismissed. */
  readonly seen: readonly string[];
  /** The learner is on the lesson's first exercise. A note never interrupts mid-lesson. */
  readonly atStart: boolean;
  /** The learner asked for it — the reference page, or "show the rule" in the bar. */
  readonly forced?: boolean;
}

/**
 * Whether the note stands between the learner and the drill.
 *
 * GRAMMAR.md wants the explanation *before* the exercise, and NEXT.md wants
 * it skippable and remembered. So: once, at the start of the lesson, unless
 * the learner has already dismissed it — and always when they ask for it.
 * A learner who has seen a rule is not stopped by it again; the reference
 * page is where they go back to it.
 */
export function shouldShowGrammarNote(input: GrammarNoteVisibility): boolean {
  if (!input.note) return false;
  if (input.forced === true) return true;
  if (!input.atStart) return false;
  return !input.seen.includes(input.note.id);
}

/**
 * Which of a skill's notes stands between the learner and the drill.
 *
 * A skill may teach more than one rule, and a lesson may only stop the
 * learner once, so the answer is the first note they have not dismissed.
 * Once they have seen them all, the lesson opens straight into the exercise
 * and the reference page is where the rules live.
 */
export function pickGrammarNote<T extends { readonly id: string; readonly order: number }>(input: {
  readonly notes: readonly T[];
  readonly seen: readonly string[];
  readonly atStart: boolean;
  readonly forced?: boolean;
}): T | null {
  const ordered = [...input.notes].sort((a, b) => a.order - b.order);
  const unseen = ordered.find((n) => !input.seen.includes(n.id));
  // Asked for deliberately: the first unseen one, or failing that the first,
  // because "show me the rule" must always have something to show.
  if (input.forced === true) return unseen ?? ordered[0] ?? null;
  if (!input.atStart) return null;
  return unseen ?? null;
}

/**
 * The note whose pattern a wrong answer is named after: the one the lesson
 * showed, or — when the learner has seen them all — the skill's first.
 */
export function correctionNoteFor<T extends { readonly id: string; readonly order: number }>(
  notes: readonly T[],
  shownId: string | null,
): T | null {
  const ordered = [...notes].sort((a, b) => a.order - b.order);
  return ordered.find((n) => n.id === shownId) ?? ordered[0] ?? null;
}

// ---------------------------------------------------------------------------
// Remembering a dismissal
// ---------------------------------------------------------------------------

/**
 * How many dismissals a client keeps. Both clients store this on the device
 * — being interrupted by a rule is a preference, not progress — so the list
 * needs a ceiling, and a learner who has met two hundred rules will not be
 * surprised by the oldest one coming back.
 */
export const SEEN_NOTES_LIMIT = 200;

/** Anything that is not a list of strings means "nothing remembered". */
export function parseSeenNotes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** The list after a dismissal: deduped, in order, and capped. */
export function withNoteSeen(seen: readonly string[], id: string): string[] {
  return [...new Set([...seen, id])].slice(-SEEN_NOTES_LIMIT);
}
