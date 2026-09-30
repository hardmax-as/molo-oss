import { SENTENCE_REQUEST_STATUSES } from "@molo/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { skills } from "./curriculum.ts";
import { sentences } from "./lexicon.ts";
import { id, timestamps } from "./shared.ts";

export const sentenceRequestStatusEnum = pgEnum(
  "sentence_request_status",
  SENTENCE_REQUEST_STATUSES,
);

/**
 * A sentence a skill needs and only a speaker can write (docs/EDITOR-GUIDE.md,
 * "Write the sentences").
 *
 * `sentences.text_xh` is NOT NULL, and should stay so: a sentence row is a
 * claim about isiXhosa, and a request is the absence of one. So the request
 * lives here, English-first, until a tutor answers it. Answering creates an
 * ordinary `draft` sentence (source `tutor`) and links it; from then on the
 * sentence, not this row, is what an editor reviews and publishes.
 *
 * **Learner-invisible by construction.** There is no content status column,
 * so no learner query that filters on `published` can ever match one, and no
 * learner route reads this table at all. `status` is a work state — open,
 * fulfilled, dismissed — and has no edge into the status spine.
 *
 * `prompt_en` and `prompt_nb` were drafted by a model from
 * `curriculum/sentence-requests.json`; they become the sentence's glosses
 * only through the tutor's save, which records whether they were edited.
 */
export const sentenceRequests = pgTable(
  "sentence_requests",
  {
    id: id(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    /** The key in `curriculum/sentence-requests.json`; unique within a skill. */
    slug: text("slug").notNull(),
    order: integer("order").notNull().default(1),
    promptEn: text("prompt_en").notNull(),
    promptNb: text("prompt_nb"),
    /** Context for the tutor: who says it to whom. Model-written, editor-only. */
    note: text("note"),
    /** The words the sentence should be built around, resolved from the lexicon. */
    targetLexemeIds: uuid("target_lexeme_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    status: sentenceRequestStatusEnum("status").notNull().default("open"),
    fulfilledSentenceId: uuid("fulfilled_sentence_id").references(() => sentences.id, {
      onDelete: "set null",
    }),
    fulfilledBy: text("fulfilled_by").references(() => users.id),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    dismissedReason: text("dismissed_reason"),
    createdBy: text("created_by").references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    unique("sentence_requests_skill_slug_uq").on(t.skillId, t.slug),
    index("sentence_requests_skill_idx").on(t.skillId, t.order),
    index("sentence_requests_status_idx").on(t.status),
  ],
);

/**
 * The tutor's answers on the golden-forms sheet (/edit/goldens), one row per
 * case, so a tutor working alone saves to the server instead of one
 * browser's storage.
 *
 * **Not content.** No status column, no learner route reads it, and nothing
 * here reaches `xh-morph`: the operator runs `molo morph goldens pull`, which
 * writes the TOML the golden tests read, and a rule changes only through that
 * reviewed PR. `form` is the tutor's own typing; nothing ever fills it from a
 * generator. `case_id` is `goldenKey()` — `["lemma","class","form"]` — and
 * the API accepts only keys of that shape.
 */
export const goldenAnswers = pgTable(
  "golden_answers",
  {
    caseId: text("case_id").primaryKey(),
    /** The tutor's answer in isiXhosa; empty means "not sure yet". */
    form: text("form").notNull().default(""),
    irregular: boolean("irregular").notNull().default(false),
    notes: text("notes").notNull().default(""),
    /** Typed by the tutor ("Your name"); the TOML's `validated_by`. */
    tutorName: text("tutor_name").notNull().default(""),
    /** `YYYY-MM-DD` or empty; the TOML's `validated_on`. */
    validatedOn: text("validated_on").notNull().default(""),
    /** The signed-in account that saved it last. */
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("golden_answers_updated_idx").on(t.updatedAt)],
);
