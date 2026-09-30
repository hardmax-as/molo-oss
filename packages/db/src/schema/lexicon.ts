import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { cefrBandEnum, linkKindEnum, registerEnum, sourceLangEnum } from "./enums.ts";
import { languages, nounClasses } from "./reference.ts";
import { id, provenanceColumns, statusColumns, timestamps } from "./shared.ts";

export const lexemes = pgTable(
  "lexemes",
  {
    id: id(),
    /**
     * The language this word is *in* — not the course that teaches it. A
     * lexeme is a fact about a language (its class, its plural, its
     * recording); a course is a curriculum over that language, and two
     * courses over isiXhosa share this row. See ARCHITECTURE section 2.6.
     */
    targetLang: text("target_lang")
      .notNull()
      .default("xh")
      .references(() => languages.code),
    lemma: text("lemma").notNull(),
    stem: text("stem"),
    pos: text("pos").notNull(),
    nounClassId: uuid("noun_class_id").references(() => nounClasses.id),
    isPlural: boolean("is_plural").notNull().default(false),
    infinitive: text("infinitive"),
    /** Tone is not written; editors fill this from audio. */
    tonePattern: text("tone_pattern"),
    register: registerEnum("register").notNull().default("standard"),
    cefrBand: cefrBandEnum("cefr_band"),
    /** Hand-curated with a tutor; unranked lexemes do not enter Units 1 to 3. */
    frequencyRank: integer("frequency_rank"),
    /** Contributor names carried from the source, for CC-BY attribution. */
    attribution: text("attribution")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...statusColumns(),
    ...provenanceColumns(),
    ...timestamps(),
  },
  (t) => [
    index("lexemes_lemma_idx").on(t.lemma),
    index("lexemes_status_idx").on(t.status),
    index("lexemes_noun_class_idx").on(t.nounClassId),
    index("lexemes_frequency_rank_idx").on(t.frequencyRank),
    index("lexemes_lemma_search_idx").using("gin", sql`to_tsvector('simple', ${t.lemma})`),
    index("lexemes_target_lang_idx").on(t.targetLang),
    // The natural key is per language: the same string can be a word in two
    // languages without being the same word.
    unique("lexemes_lemma_pos_class_plural_uq").on(
      t.targetLang,
      t.lemma,
      t.pos,
      t.nounClassId,
      t.isPlural,
    ),
  ],
);

export const glosses = pgTable(
  "glosses",
  {
    id: id(),
    lexemeId: uuid("lexeme_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    sourceLang: sourceLangEnum("source_lang").notNull(),
    gloss: text("gloss").notNull(),
    usageNote: text("usage_note"),
    /** Norwegian tone hints (tonelag) live here for `nb`; stress notes for `en`. */
    contrastiveNote: text("contrastive_note"),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [
    unique("glosses_lexeme_lang_uq").on(t.lexemeId, t.sourceLang),
    index("glosses_search_idx").using("gin", sql`to_tsvector('simple', ${t.gloss})`),
  ],
);

/** Machine opinions for editors only. No status spine and no learner joins. */
export const glossSuggestions = pgTable(
  "gloss_suggestions",
  {
    id: id(),
    lexemeId: uuid("lexeme_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    sourceLang: sourceLangEnum("source_lang").notNull(),
    provenance: text("provenance").notNull(),
    gloss: text("gloss").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("gloss_suggestions_lexeme_lang_provenance_uq").on(
      t.lexemeId,
      t.sourceLang,
      t.provenance,
    ),
  ],
);

export const lexemeLinks = pgTable(
  "lexeme_links",
  {
    id: id(),
    fromId: uuid("from_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    toId: uuid("to_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    kind: linkKindEnum("kind").notNull(),
    /** The upstream link type, kept verbatim (isixhosa.click: related, confusable, ...). */
    sourceKind: text("source_kind"),
  },
  (t) => [
    unique("lexeme_links_uq").on(t.fromId, t.toId, t.kind),
    index("lexeme_links_to_idx").on(t.toId),
  ],
);

export const sentences = pgTable(
  "sentences",
  {
    id: id(),
    /** The language the sentence is in; like a lexeme, it belongs to a language, not a course. */
    targetLang: text("target_lang")
      .notNull()
      .default("xh")
      .references(() => languages.code),
    textXh: text("text_xh").notNull(),
    /** tense, polarity, concord pattern, focus. */
    grammarTags: jsonb("grammar_tags").$type<Record<string, unknown>>().notNull().default({}),
    cefrBand: cefrBandEnum("cefr_band"),
    register: registerEnum("register").notNull().default("standard"),
    ...statusColumns(),
    ...provenanceColumns(),
    ...timestamps(),
  },
  (t) => [
    index("sentences_status_idx").on(t.status),
    index("sentences_search_idx").using("gin", sql`to_tsvector('simple', ${t.textXh})`),
    index("sentences_target_lang_idx").on(t.targetLang),
    // The natural key. Two rows with the same isiXhosa text from the same
    // source are one sentence: without this the dev seed duplicated them on
    // every re-run and a learner could meet the same string twice. Keyed per
    // language, as the lexeme key is.
    unique("sentences_text_source_uq").on(t.targetLang, t.textXh, t.source),
  ],
);

export const sentenceGlosses = pgTable(
  "sentence_glosses",
  {
    id: id(),
    sentenceId: uuid("sentence_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "cascade" }),
    sourceLang: sourceLangEnum("source_lang").notNull(),
    gloss: text("gloss").notNull(),
    /** Word-by-word, for the "why" panel. */
    literalGloss: text("literal_gloss"),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [unique("sentence_glosses_lang_uq").on(t.sentenceId, t.sourceLang)],
);

/** The inflected form as it appears; from xh-morph or an editor, never an LLM. */
export const sentenceLexemes = pgTable(
  "sentence_lexemes",
  {
    id: id(),
    sentenceId: uuid("sentence_id")
      .notNull()
      .references(() => sentences.id, { onDelete: "cascade" }),
    lexemeId: uuid("lexeme_id")
      .notNull()
      .references(() => lexemes.id),
    position: integer("position").notNull(),
    surfaceForm: text("surface_form").notNull(),
    morphVerified: boolean("morph_verified").notNull().default(false),
    irregular: boolean("irregular").notNull().default(false),
    irregularNote: text("irregular_note"),
  },
  (t) => [
    unique("sentence_lexemes_position_uq").on(t.sentenceId, t.position),
    index("sentence_lexemes_lexeme_idx").on(t.lexemeId),
  ],
);
