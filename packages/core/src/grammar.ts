/**
 * Grammar notes at the API boundary (docs/GRAMMAR.md section 1).
 *
 * The rules these shapes are read by — when a note interrupts a lesson, how
 * a flat list of cells becomes a table, how a word is split into its parts —
 * live in `grammar-rules.ts`, which is Effect-free so mobile's Jest suite
 * can hold them without a schema library, and is re-exported from here.
 *
 * ## Why the shape is what it is
 *
 * GRAMMAR.md section 1 says the audio is part of the rule rather than an
 * illustration of it, because tone is phonemic and the orthography does not
 * mark it. So a paradigm is not a table of strings: it is a table of
 * *cells*, each of which may carry a recording and each of which says so
 * when it does not. And the writing hides structure, so a cell also carries
 * its morphemes — the same shape the Gothenburg corpus gives per token
 * (`segmented`, morphemes in order).
 *
 * ## What may be in a cell
 *
 * A cell's `surfaceForm` is never composed by a model. It is either a lemma
 * that exists in the lexicon verbatim, or a form `xh-morph` generated from
 * the rule table. `packages/content/src/grammar.ts` is what enforces that
 * on the way in; this module only describes the result.
 */

import { Schema } from "effect";

import { AudioRef } from "./audio.ts";
import { SourceLangSchema, Uuid } from "./content.ts";
import { GRAMMAR_CELL_ROLES } from "./grammar-rules.ts";

export const GrammarCellRoleSchema = Schema.Literal(...GRAMMAR_CELL_ROLES);

/** One cell of a note: a form, its morphemes, and the recording of it (or nothing). */
export const GrammarCellView = Schema.Struct({
  id: Uuid,
  role: GrammarCellRoleSchema,
  order: Schema.Int,
  /** The row this cell belongs to; a class label, usually. Empty for the worked example. */
  rowLabel: Schema.String,
  /** `grammar.columns.<key>` when the client knows the key, else shown verbatim. */
  colKey: Schema.String,
  /** A lexicon lemma, verbatim, or a form `xh-morph` generated. Never composed. */
  surfaceForm: Schema.String,
  /** In order; empty when nothing has segmented this form yet. */
  morphemes: Schema.Array(Schema.String),
  /** The lexeme this cell came from, when it came from one. */
  lexemeId: Schema.NullOr(Uuid),
  /** Null means there is no recording yet, and the cell must say so. */
  audioAssetId: Schema.NullOr(Uuid),
});
export type GrammarCellView = typeof GrammarCellView.Type;

/** A note as a learner reads it: one source language, published only. */
export const GrammarNoteView = Schema.Struct({
  id: Uuid,
  slug: Schema.String,
  skillId: Uuid,
  order: Schema.Int,
  /** What the paradigm's first column is called; `grammar.columns.<key>` or verbatim. */
  rowHeaderKey: Schema.String,
  sourceLang: SourceLangSchema,
  title: Schema.String,
  /** The rule, in a sentence or two. */
  rule: Schema.String,
  /** Named after a wrong answer, in the check bar. Empty when the editor left it out. */
  correction: Schema.String,
  cells: Schema.Array(GrammarCellView),
});
export type GrammarNoteView = typeof GrammarNoteView.Type;

/** One entry on the reference page. `unlocked` is this learner's, not the note's. */
export const GrammarReferenceEntry = Schema.Struct({
  ...GrammarNoteView.fields,
  unitSlug: Schema.String,
  unitTitleKey: Schema.String,
  skillTitleKey: Schema.String,
  /** The learner has finished at least one lesson in the note's skill. */
  unlocked: Schema.Boolean,
});
export type GrammarReferenceEntry = typeof GrammarReferenceEntry.Type;

/** GET /grammar — every published note of the enrolled course, with this learner's state. */
export const GrammarReferenceResponse = Schema.Struct({
  notes: Schema.Array(GrammarReferenceEntry),
  sourceLang: SourceLangSchema,
  /** Keyed by `audioAssetId`; a cell whose id is absent has no recording yet. */
  audioAssets: Schema.Record({ key: Schema.String, value: AudioRef }),
});
export type GrammarReferenceResponse = typeof GrammarReferenceResponse.Type;

export * from "./grammar-rules.ts";
