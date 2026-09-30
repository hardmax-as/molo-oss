import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

import { audioAssets } from "./audio.ts";
import { skills } from "./curriculum.ts";
import { grammarCellRoleEnum, sourceLangEnum } from "./enums.ts";
import { lexemes } from "./lexicon.ts";
import { id, statusColumns, timestamps } from "./shared.ts";

/**
 * The explicit grammar a learner is shown (docs/GRAMMAR.md section 1): a
 * worked example, then the rule in a sentence or two, then the drill, and a
 * correction that names the pattern afterwards.
 *
 * A note is content like every other row. It belongs to a **skill**, it runs
 * the same status machine, and a learner surface queries `published` only.
 * Nothing here creates a route into `published` that `transition()` does not
 * already own.
 *
 * ## The caveat is a column, not a convention
 *
 * GRAMMAR.md section 4 is the reason this table exists in the shape it
 * does. Our finite-state guarantee protects the *form* `xh-morph` produces,
 * not the *rule* the note states about it, and every value in
 * `crates/xh-morph/rules/noun_classes.toml` is an unvalidated claim. So a
 * note carries `caveat`: what the reviewing editor is being asked to check
 * beyond whether the English reads well. An editor publishing a note is
 * validating two things at once, and the row says which.
 */
export const grammarNotes = pgTable(
  "grammar_notes",
  {
    id: id(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    order: integer("order").notNull().default(1),
    /**
     * What the paradigm's first column is called — `grammar.columns.<key>`
     * where a client knows the key, else shown verbatim. The row labels are
     * that column's values, so the header row is not left blank.
     */
    rowHeaderKey: text("row_header_key").notNull().default("class"),
    /**
     * What the reviewer must validate about the *claim*, not the prose.
     * Written by whatever produced the note; never shown to a learner.
     */
    caveat: text("caveat"),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [
    unique("grammar_notes_skill_slug_uq").on(t.skillId, t.slug),
    index("grammar_notes_skill_idx").on(t.skillId, t.order),
    index("grammar_notes_status_idx").on(t.status),
  ],
);

/**
 * The note in one source language. Separate rows rather than a jsonb blob
 * for the same reason `glosses` are: each language is reviewed, approved and
 * published on its own, and an `ai_draft` English body must be able to sit
 * next to a published Norwegian one without either contaminating the other.
 */
export const grammarNoteBodies = pgTable(
  "grammar_note_bodies",
  {
    id: id(),
    grammarNoteId: uuid("grammar_note_id")
      .notNull()
      .references(() => grammarNotes.id, { onDelete: "cascade" }),
    sourceLang: sourceLangEnum("source_lang").notNull(),
    title: text("title").notNull(),
    /** The rule, in a sentence or two. This is the thing an editor argues with. */
    rule: text("rule").notNull(),
    /**
     * Named in the check bar after a wrong answer — "this is the subject
     * concord again", not "wrong". Nullable: a note may have nothing extra
     * to say, and the bar then falls back to the title.
     */
    correction: text("correction"),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [
    unique("grammar_note_bodies_note_lang_uq").on(t.grammarNoteId, t.sourceLang),
    index("grammar_note_bodies_status_idx").on(t.status),
  ],
);

/**
 * One cell of a note: the worked example, or a cell of the paradigm.
 *
 * **`surface_form` is never composed.** It is either a lemma that exists in
 * the lexicon verbatim or a form `xh-morph` generated from the rule table
 * (`packages/content/src/grammar.ts` is what refuses anything else on the
 * way in). `morphemes` is the same shape the Gothenburg corpus gives per
 * token, so a cell filled from the corpus and one filled from the generator
 * render identically.
 *
 * Cells carry no status of their own: the note's status governs them, and
 * the note's publish gate walks `lexeme_id` and `audio_asset_id` so a note
 * can never show a word or a recording a learner may not see. `audio_asset_id`
 * is nullable on purpose — GRAMMAR.md says a written paradigm is never
 * complete, so a cell with no recording says so rather than pretending.
 */
export const grammarNoteCells = pgTable(
  "grammar_note_cells",
  {
    id: id(),
    grammarNoteId: uuid("grammar_note_id")
      .notNull()
      .references(() => grammarNotes.id, { onDelete: "cascade" }),
    role: grammarCellRoleEnum("role").notNull().default("paradigm"),
    order: integer("order").notNull(),
    /** The paradigm row, usually a noun-class label. Empty for the worked example. */
    rowLabel: text("row_label").notNull().default(""),
    /** `grammar.columns.<key>` where a client knows the key, else shown verbatim. */
    colKey: text("col_key").notNull(),
    surfaceForm: text("surface_form").notNull(),
    morphemes: text("morphemes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lexemeId: uuid("lexeme_id").references(() => lexemes.id, { onDelete: "set null" }),
    audioAssetId: uuid("audio_asset_id").references(() => audioAssets.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (t) => [
    unique("grammar_note_cells_note_order_uq").on(t.grammarNoteId, t.order),
    index("grammar_note_cells_note_idx").on(t.grammarNoteId, t.order),
  ],
);
