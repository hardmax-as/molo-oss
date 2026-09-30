/**
 * What a tutor is asked to supply: the content only a speaker can.
 *
 * ## Sentence requests
 *
 * A request is an English (and Norwegian) sentence a beginner needs, built
 * around words a skill already teaches, waiting for a speaker to say how it
 * goes in isiXhosa. The English and Norwegian were drafted by a model from
 * `curriculum/sentence-requests.json`; the isiXhosa is typed by the tutor
 * and by nobody else. A request is never shown to a learner: it has no
 * content status at all, only a work state, and the only thing it can turn
 * into is a `draft` sentence that then runs the ordinary publish gate.
 *
 * ## Culture cards
 *
 * A culture card is an ordinary `culture_card` exercise. The ones
 * `molo content culture` loads were written by a model and enter at
 * `ai_draft`, with a caveat listing the exact claims the tutor must confirm.
 * This module only holds the shapes the editor surface exchanges.
 *
 * Pure: no I/O.
 */

import { Schema } from "effect";

import { Uuid } from "./content.ts";
import { ExercisePayload } from "./exercises/index.ts";
import { StatusSchema } from "./status.ts";

/** A request's work state. Not the content status spine: a request is never content. */
export const SENTENCE_REQUEST_STATUSES = ["open", "fulfilled", "dismissed"] as const;
export type SentenceRequestStatus = (typeof SENTENCE_REQUEST_STATUSES)[number];
export const SentenceRequestStatusSchema = Schema.Literal(...SENTENCE_REQUEST_STATUSES);

/** `sentences.source` for a sentence a tutor typed in answer to a request. */
export const TUTOR_SENTENCE_SOURCE = "tutor";
/** A tutor's sentence is Molo's own work, like an editor's. */
export const TUTOR_SENTENCE_LICENCE = "proprietary-molo";

/**
 * The provenance line a tutor's sentence carries in `sentences.source_ref`:
 * "tutor, <name>, <yyyy-mm-dd>". Who typed it and when, in the words the
 * editor guide uses, so an audit reads the row without a join.
 */
export function tutorProvenance(name: string, at: Date): string {
  const who = name.trim() === "" ? "unnamed" : name.trim().replace(/\s+/g, " ");
  return `tutor, ${who}, ${at.toISOString().slice(0, 10)}`;
}

/** One word a request should use, as the tutor sees it. */
export const SentenceRequestWord = Schema.Struct({
  lexemeId: Uuid,
  lemma: Schema.String,
  pos: Schema.String,
  /** Whatever gloss exists per source language, at any status: read for meaning, not published. */
  gloss: Schema.Struct({ en: Schema.optional(Schema.String), nb: Schema.optional(Schema.String) }),
});
export type SentenceRequestWord = typeof SentenceRequestWord.Type;

/** A request as the "Write sentences" page shows it. */
export const SentenceRequestView = Schema.Struct({
  id: Uuid,
  unitSlug: Schema.String,
  skillSlug: Schema.String,
  skillTitleKey: Schema.String,
  slug: Schema.String,
  order: Schema.Number,
  promptEn: Schema.String,
  promptNb: Schema.NullOr(Schema.String),
  /** Context for the tutor: who is speaking to whom, what register. Model-written. */
  note: Schema.NullOr(Schema.String),
  status: SentenceRequestStatusSchema,
  words: Schema.Array(SentenceRequestWord),
  fulfilled: Schema.NullOr(
    Schema.Struct({
      sentenceId: Uuid,
      textXh: Schema.String,
      status: StatusSchema,
      sourceRef: Schema.NullOr(Schema.String),
    }),
  ),
  dismissedReason: Schema.NullOr(Schema.String),
});
export type SentenceRequestView = typeof SentenceRequestView.Type;

/**
 * The tutor's answer. `textXh` is stored exactly as typed. `promptEn` and
 * `promptNb` are the tutor's edits to the translation, when the drafted
 * English does not say what the isiXhosa says; omitted means "as drafted".
 */
export const FulfilSentenceRequestBody = Schema.Struct({
  textXh: Schema.Trim.pipe(Schema.nonEmptyString(), Schema.maxLength(500)),
  promptEn: Schema.optional(Schema.Trim.pipe(Schema.nonEmptyString(), Schema.maxLength(500))),
  promptNb: Schema.optional(Schema.Trim.pipe(Schema.nonEmptyString(), Schema.maxLength(500))),
});
export type FulfilSentenceRequestBody = typeof FulfilSentenceRequestBody.Type;

/** Setting a request aside: the sentence does not work in isiXhosa, or is not worth teaching. */
export const DismissSentenceRequestBody = Schema.Struct({
  reason: Schema.Trim.pipe(Schema.nonEmptyString(), Schema.maxLength(1000)),
});
export type DismissSentenceRequestBody = typeof DismissSentenceRequestBody.Type;

/** A culture card as the review page shows it: the exercise, its caveat, the words it names. */
export const CultureCardView = Schema.Struct({
  id: Uuid,
  unitSlug: Schema.String,
  skillSlug: Schema.String,
  lessonId: Uuid,
  status: StatusSchema,
  /** `exercises.note`: the claims the reviewer must confirm. Never shown to a learner. */
  caveat: Schema.NullOr(Schema.String),
  payload: ExercisePayload,
  words: Schema.Array(
    Schema.Struct({ lexemeId: Uuid, lemma: Schema.String, status: StatusSchema }),
  ),
  updatedAt: Schema.String,
  /**
   * The newest `content_revisions` row for the card: an edit or a status move,
   * and who made it. Null when nothing has touched it since it was loaded.
   */
  lastEdit: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        actorName: Schema.NullOr(Schema.String),
        at: Schema.String,
        /** "edit" for a text or words change, "status" for a move. */
        what: Schema.Literal("edit", "status", "created"),
      }),
    ),
  ),
});
export type CultureCardView = typeof CultureCardView.Type;
