/**
 * Exercise payload contracts (ARCHITECTURE section 3). One Effect Schema
 * per type; the `exercises.payload` jsonb column must decode against the
 * schema for its `type`.
 *
 * Payloads reference content by id only. Glosses, audio URLs and surface
 * forms are hydrated at read time from `published` rows for the learner's
 * source language, so a payload never carries text that could go stale or
 * bypass review.
 */

import { Either, Schema } from "effect";

import { clickSoundById } from "../click-sounds.ts";
import { ClickSchema, NounClassLabelSchema, SourceLangSchema, Uuid } from "../content.ts";

export const EXERCISE_TYPES = [
  "listen_select",
  "select_listen",
  "translate_tap",
  "translate_type",
  "concord_fill",
  "class_sort",
  "click_drill",
  "speak",
  "match_pairs",
  "culture_card",
  "click_identify",
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];
export const ExerciseTypeSchema = Schema.Literal(...EXERCISE_TYPES);

const Option = Schema.Struct({ lexemeId: Uuid, correct: Schema.Boolean });

/** Two to four options, exactly one of them correct. */
const Options = Schema.Array(Option).pipe(
  Schema.minItems(2),
  Schema.maxItems(4),
  Schema.filter(
    (opts) => opts.filter((o) => o.correct).length === 1 || "exactly one option must be correct",
  ),
);

/** Hear a word or sentence, pick the gloss. */
export const ListenSelect = Schema.Struct({
  type: Schema.Literal("listen_select"),
  prompt: Schema.Struct({
    lexemeId: Uuid,
    /** Override the default published audio (e.g. a specific speaker). */
    audioAssetId: Schema.optional(Uuid),
  }),
  options: Options,
  note: Schema.optional(Schema.String),
});

/** See the gloss, pick the audio that says it. */
export const SelectListen = Schema.Struct({
  type: Schema.Literal("select_listen"),
  prompt: Schema.Struct({ lexemeId: Uuid }),
  options: Options,
  note: Schema.optional(Schema.String),
});

/** Assemble the sentence from tiles; tiles come from sentence_lexemes surface forms. */
export const TranslateTap = Schema.Struct({
  type: Schema.Literal("translate_tap"),
  sentenceId: Uuid,
  /** Same pos as the sentence's lexemes; adjacent noun classes for nouns. Never invented. */
  distractorLexemeIds: Schema.Array(Uuid).pipe(Schema.maxItems(6)),
  note: Schema.optional(Schema.String),
});

/** Type the isiXhosa; lenient on tone marks, strict on clicks. */
export const TranslateType = Schema.Struct({
  type: Schema.Literal("translate_type"),
  sentenceId: Uuid,
  note: Schema.optional(Schema.String),
});

export const ConcordForm = Schema.Literal(
  "plural",
  "subject_concord",
  "object_concord",
  "possessive",
);

/** Fill the concord; target and distractors come from xh-morph. */
export const ConcordFill = Schema.Struct({
  type: Schema.Literal("concord_fill"),
  sentenceId: Uuid,
  blanks: Schema.Array(
    Schema.Struct({
      /** Position in sentence_lexemes. */
      position: Schema.Int.pipe(Schema.nonNegative()),
      lexemeId: Uuid,
      form: ConcordForm,
      /** xh-morph output for other classes, used as distractors. */
      distractors: Schema.Array(Schema.NonEmptyString).pipe(Schema.maxItems(4)),
    }),
  ).pipe(Schema.minItems(1)),
  note: Schema.optional(Schema.String),
});

/** Drag nouns into their class buckets. */
export const ClassSort = Schema.Struct({
  type: Schema.Literal("class_sort"),
  buckets: Schema.Array(NounClassLabelSchema).pipe(Schema.minItems(2)),
  items: Schema.Array(Schema.Struct({ lexemeId: Uuid })).pipe(Schema.minItems(2)),
  note: Schema.optional(Schema.String),
});

const ClickItem = Schema.Struct({
  lexemeId: Uuid,
  click: ClickSchema,
  /**
   * Tier-1 audio from the set's single speaker. Optional while the drill is
   * a draft awaiting recording; `missingDrillAudio()` lists the gaps and the
   * publish gate refuses a drill with any. Drills never fall back to other audio.
   */
  audioAssetId: Schema.optional(Uuid),
});

/** Minimal pairs on the clicks: hear, identify; then record and compare. */
export const ClickDrill = Schema.Struct({
  type: Schema.Literal("click_drill"),
  set: Schema.NonEmptyString,
  contrast: Schema.Array(ClickSchema).pipe(Schema.minItems(2)),
  /** The single speaker for the whole set. Optional until recorded. */
  speakerId: Schema.optional(Uuid),
  steps: Schema.Array(Schema.Literal("listen_identify", "listen_pair", "record_compare")).pipe(
    Schema.minItems(1),
  ),
  pairs: Schema.Array(
    Schema.Struct({
      a: ClickItem,
      b: ClickItem,
      audioSlowAssetId: Schema.optional(Uuid),
    }),
  ),
  /** Words carrying each click, for the identify step when no minimal pair exists. */
  contrastWords: Schema.Array(ClickItem),
  note: Schema.optional(Schema.String),
}).pipe(
  Schema.filter(
    (d) =>
      d.pairs.length > 0 || d.contrastWords.length > 0 || "a drill needs pairs or contrast words",
  ),
);

/** One of the fifteen bare clicks in `CLICK_SOUNDS`, by its fixed id. */
const ClickSoundId = Uuid.pipe(
  Schema.filter((id) => clickSoundById(id) !== undefined || "not a CLICK_SOUNDS id"),
);

/**
 * Hear a bare click, pick its letter. The learner hears the published
 * tier-1 studio take of each click in `clicks` once, in a shuffled order,
 * and picks from all of them each time. No lexeme is involved: the payload
 * names clicks by their `CLICK_SOUNDS` id, and the recordings are hydrated
 * at read time from published `audio_assets` of `target_kind = 'click'`.
 * Publishing needs a published tier-1 take of every click listed.
 */
export const ClickIdentify = Schema.Struct({
  type: Schema.Literal("click_identify"),
  /** The contrast set, `CLICK_IDENTIFY_SETS` key ("A", "B" ...); a label for editors. */
  set: Schema.NonEmptyString,
  clicks: Schema.Array(ClickSoundId).pipe(
    Schema.minItems(2),
    Schema.maxItems(6),
    Schema.filter((ids) => new Set(ids).size === ids.length || "a click is listed twice"),
  ),
  note: Schema.optional(Schema.String),
});

/** Record the prompt; ASR is advisory only (ARCHITECTURE section 6). */
export const Speak = Schema.Struct({
  type: Schema.Literal("speak"),
  prompt: Schema.Union(Schema.Struct({ lexemeId: Uuid }), Schema.Struct({ sentenceId: Uuid })),
  referenceAudioAssetId: Uuid,
  note: Schema.optional(Schema.String),
});

/** Word, gloss and audio matching. */
export const MatchPairs = Schema.Struct({
  type: Schema.Literal("match_pairs"),
  pairs: Schema.Array(Schema.Struct({ lexemeId: Uuid })).pipe(
    Schema.minItems(2),
    Schema.maxItems(6),
  ),
  note: Schema.optional(Schema.String),
});

const PerSourceLang = Schema.Record({ key: SourceLangSchema, value: Schema.String });

/** Short note, no scoring. Editor-written; per source language. */
export const CultureCard = Schema.Struct({
  type: Schema.Literal("culture_card"),
  title: PerSourceLang,
  body: PerSourceLang,
  lexemeIds: Schema.Array(Uuid),
  note: Schema.optional(Schema.String),
});

export const ExercisePayload = Schema.Union(
  ListenSelect,
  SelectListen,
  TranslateTap,
  TranslateType,
  ConcordFill,
  ClassSort,
  ClickDrill,
  Speak,
  MatchPairs,
  CultureCard,
  ClickIdentify,
);
export type ExercisePayload = typeof ExercisePayload.Type;
export type ExercisePayloadEncoded = typeof ExercisePayload.Encoded;

export const SCHEMA_BY_TYPE = {
  listen_select: ListenSelect,
  select_listen: SelectListen,
  translate_tap: TranslateTap,
  translate_type: TranslateType,
  concord_fill: ConcordFill,
  class_sort: ClassSort,
  click_drill: ClickDrill,
  speak: Speak,
  match_pairs: MatchPairs,
  culture_card: CultureCard,
  click_identify: ClickIdentify,
} as const;

export const decodeExercisePayload = Schema.decodeUnknownEither(ExercisePayload);

/** Decodes and additionally asserts the payload's `type` matches the row's `type`. */
export function decodePayloadForType(
  type: ExerciseType,
  payload: unknown,
): Either.Either<ExercisePayload, string> {
  const decoded = decodeExercisePayload(payload);
  if (Either.isLeft(decoded)) return Either.left(String(decoded.left));
  if (decoded.right.type !== type) {
    return Either.left(`payload type ${decoded.right.type} does not match exercise type ${type}`);
  }
  return Either.right(decoded.right);
}

/** Lexemes in a click drill that still have no tier-1 recording; a drill with any cannot publish. */
export function missingDrillAudio(p: ExercisePayload): readonly string[] {
  if (p.type !== "click_drill") return [];
  const missing: string[] = [];
  if (!p.speakerId) missing.push("speaker");
  for (const pair of p.pairs) {
    for (const side of [pair.a, pair.b]) if (!side.audioAssetId) missing.push(side.lexemeId);
  }
  for (const w of p.contrastWords) if (!w.audioAssetId) missing.push(w.lexemeId);
  return missing;
}

/** The bare clicks (`CLICK_SOUNDS` ids) an exercise plays; the click gate walks these. */
export function referencedClickIds(p: ExercisePayload): readonly string[] {
  return p.type === "click_identify" ? [...p.clicks] : [];
}

/**
 * The one lexeme an exercise is *about*, for the mistakes list. Only types
 * with an unambiguous subject report one: marking every word of a
 * match-pairs grid wrong because one tile was misplaced would teach the
 * learner nothing. Null means "this exercise produces no mistake row".
 */
export function mistakeLexemeId(p: ExercisePayload): string | null {
  switch (p.type) {
    case "listen_select":
    case "select_listen":
      return p.prompt.lexemeId;
    case "concord_fill":
      return p.blanks.length === 1 ? (p.blanks[0]?.lexemeId ?? null) : null;
    case "speak":
      return "lexemeId" in p.prompt ? p.prompt.lexemeId : null;
    default:
      return null;
  }
}

export interface ReferencedIds {
  readonly lexemeIds: readonly string[];
  readonly sentenceIds: readonly string[];
  readonly audioAssetIds: readonly string[];
  readonly speakerIds: readonly string[];
}

/** Every id a payload points at; the publish gate walks these. */
export function referencedIds(p: ExercisePayload): ReferencedIds {
  const lexemeIds = new Set<string>();
  const sentenceIds = new Set<string>();
  const audioAssetIds = new Set<string>();
  const speakerIds = new Set<string>();
  switch (p.type) {
    case "listen_select":
    case "select_listen":
      lexemeIds.add(p.prompt.lexemeId);
      if (p.type === "listen_select" && p.prompt.audioAssetId)
        audioAssetIds.add(p.prompt.audioAssetId);
      for (const o of p.options) lexemeIds.add(o.lexemeId);
      break;
    case "translate_tap":
      sentenceIds.add(p.sentenceId);
      for (const id of p.distractorLexemeIds) lexemeIds.add(id);
      break;
    case "translate_type":
      sentenceIds.add(p.sentenceId);
      break;
    case "concord_fill":
      sentenceIds.add(p.sentenceId);
      for (const b of p.blanks) lexemeIds.add(b.lexemeId);
      break;
    case "class_sort":
      for (const i of p.items) lexemeIds.add(i.lexemeId);
      break;
    case "click_drill":
      if (p.speakerId) speakerIds.add(p.speakerId);
      for (const pair of p.pairs) {
        for (const side of [pair.a, pair.b]) {
          lexemeIds.add(side.lexemeId);
          if (side.audioAssetId) audioAssetIds.add(side.audioAssetId);
        }
        if (pair.audioSlowAssetId) audioAssetIds.add(pair.audioSlowAssetId);
      }
      for (const w of p.contrastWords) {
        lexemeIds.add(w.lexemeId);
        if (w.audioAssetId) audioAssetIds.add(w.audioAssetId);
      }
      break;
    case "speak":
      if ("lexemeId" in p.prompt) lexemeIds.add(p.prompt.lexemeId);
      else sentenceIds.add(p.prompt.sentenceId);
      audioAssetIds.add(p.referenceAudioAssetId);
      break;
    case "match_pairs":
      for (const pair of p.pairs) lexemeIds.add(pair.lexemeId);
      break;
    case "culture_card":
      for (const id of p.lexemeIds) lexemeIds.add(id);
      break;
    case "click_identify":
      // Bare clicks are not lexemes or audio asset ids; `referencedClickIds`
      // names them and the gate looks their recordings up by click.
      break;
  }
  return {
    lexemeIds: [...lexemeIds],
    sentenceIds: [...sentenceIds],
    audioAssetIds: [...audioAssetIds],
    speakerIds: [...speakerIds],
  };
}
export * from "./answer.ts";
export * from "./match-pairs.ts";
export * from "./modes.ts";
export * from "./option-labels.ts";
