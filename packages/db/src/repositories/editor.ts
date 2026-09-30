/**
 * Editorial writes. Every function re-checks the actor's role. Rows are
 * created as `draft` or `ai_draft` only; the single place that writes
 * `published` is `transitionEntity()`, which wraps `transition()` from
 * `@molo/core` and the publish gates. `test:integrity` asserts that no
 * other write path can set `published`.
 */

import {
  clickSoundById,
  clicksMissingAudio,
  decodePayloadForType,
  containerPublishGate,
  grammarNotePublishGate,
  graphPublishGate,
  lexemePublishGate,
  missingDrillAudio,
  morphGeneratorFor,
  optionCollisions,
  optionLexemeIds,
  type OptionLabels,
  referencedClickIds,
  referencedIds,
  sentencePublishGate,
  transition,
  describeTransitionError,
  type Actor,
  type AudioManifest,
  type ContentNote,
  type AudioTier,
  type CefrBand,
  type ExerciseType,
  type GrammarCellRole,
  type GateResult,
  type LinkKind,
  type ReferencedEntity,
  type Register,
  type Role,
  type SkillKind,
  type SourceLang,
  type Status,
  type Statusable,
} from "@molo/core";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Either } from "effect";

import type { Db } from "../client.ts";
import { audioAssets } from "../schema/audio.ts";
import { userRoles, users } from "../schema/auth.ts";
import { courses, exercises, lessons, skills, units } from "../schema/curriculum.ts";
import {
  contentRevisions,
  reviewAssignments,
  reviewQueue as reviewQueueView,
} from "../schema/editorial.ts";
import type { entityKindEnum } from "../schema/enums.ts";
import { grammarNoteBodies, grammarNoteCells, grammarNotes } from "../schema/grammar.ts";
import {
  glosses,
  lexemeLinks,
  lexemes,
  sentenceGlosses,
  sentenceLexemes,
  sentences,
} from "../schema/lexicon.ts";
import { languages, nounClasses, speakers } from "../schema/reference.ts";
import { RepoError } from "./errors.ts";
import { assertEditorial } from "./roles.ts";

export type EntityKind = (typeof entityKindEnum.enumValues)[number];
/** Kinds that carry the status spine (everything but speakers and bare clicks, which have no row). */
export type StatusKind = Exclude<EntityKind, "speaker" | "click">;

/** Where a row came from decides its starting status. */
export type Origin = "human" | "llm";
function initialStatus(origin: Origin): Status {
  return origin === "llm" ? "ai_draft" : "draft";
}

/** The editor's view of the curriculum: every status, nothing hydrated. */
export interface CurriculumUnit {
  readonly id: string;
  readonly courseId: string;
  readonly slug: string;
  readonly titleKey: string;
  readonly order: number;
  readonly cefrBand: CefrBand;
  readonly prerequisiteUnitId: string | null;
  readonly status: Status;
  readonly updatedAt: string;
  readonly skills: ReadonlyArray<{
    readonly id: string;
    readonly slug: string;
    readonly titleKey: string;
    readonly order: number;
    readonly kind: SkillKind;
    readonly status: Status;
    readonly lessons: ReadonlyArray<{
      readonly id: string;
      readonly order: number;
      readonly estimatedMinutes: number;
      readonly status: Status;
      readonly exercises: ReadonlyArray<{
        readonly id: string;
        readonly order: number;
        readonly type: ExerciseType;
        readonly status: Status;
        readonly note: string | null;
        readonly lexemeCount: number;
        readonly updatedAt: string;
      }>;
    }>;
  }>;
}

/**
 * Morphology, asked per target language. `generatorFor` answers "which
 * generator does this course's language use" — `xh-morph` for isiXhosa,
 * null for anything else, which means no morphology-dependent publishing
 * (ARCHITECTURE section 2.6). `canGeneratePlural` must return false for any
 * language it has no generator for and for any class that is not
 * tutor-validated, even if a form comes out: an unvalidated rule is not a
 * source of truth (crates/xh-morph/README.md).
 */
export interface MorphPort {
  generatorFor(targetLang: string): string | null;
  canGeneratePlural(targetLang: string, lemma: string, nounClassLabel: string): Promise<boolean>;
}

/**
 * Until the WASM build is wired in, nothing is generable and nouns need a
 * plural_of link. `generatorFor` still answers truthfully — isiXhosa *has* a
 * generator, this process just cannot reach it — so an unwired caller sees
 * "the generator could not" rather than "there is no generator".
 */
export const noMorph: MorphPort = {
  generatorFor: morphGeneratorFor,
  canGeneratePlural: () => Promise.resolve(false),
};

export interface EditorDeps {
  readonly morph: MorphPort;
}

export interface NewLexeme {
  /** The language the word is in. Omitted means the default course's language. */
  readonly targetLang?: string | undefined;
  readonly lemma: string;
  readonly pos: string;
  readonly nounClassLabel?: string | null | undefined;
  readonly isPlural?: boolean | undefined;
  readonly infinitive?: string | null | undefined;
  readonly stem?: string | null | undefined;
  readonly register?: Register | undefined;
  readonly cefrBand?: CefrBand | null | undefined;
  readonly frequencyRank?: number | null | undefined;
  readonly source: string;
  readonly sourceRef?: string | null | undefined;
  readonly licence: string;
  readonly attribution?: readonly string[] | undefined;
  readonly origin: Origin;
}

/** Sentence fields an editor may change directly; tokens and glosses have their own writers. */
export interface SentencePatch {
  readonly textXh?: string | undefined;
  readonly register?: Register | undefined;
  readonly cefrBand?: CefrBand | null | undefined;
  readonly grammarTags?: Record<string, unknown> | undefined;
  readonly sourceRef?: string | null | undefined;
  readonly licence?: string | undefined;
}

/** Fields an editor may change directly. Status and approval are deliberately absent. */
export interface LexemePatch {
  readonly lemma?: string | undefined;
  readonly pos?: string | undefined;
  readonly nounClassLabel?: string | null | undefined;
  readonly isPlural?: boolean | undefined;
  readonly infinitive?: string | null | undefined;
  readonly stem?: string | null | undefined;
  readonly register?: Register | undefined;
  readonly cefrBand?: CefrBand | null | undefined;
  readonly frequencyRank?: number | null | undefined;
  readonly sourceRef?: string | null | undefined;
  readonly licence?: string | undefined;
  readonly tonePattern?: string | null | undefined;
}

/**
 * A grammar note (docs/GRAMMAR.md). `origin` decides the starting status the
 * same way it does for a gloss: anything a model wrote enters as `ai_draft`
 * and has no route to `published` that does not pass an editor.
 *
 * `caveat` is not decoration. Every note built on
 * `crates/xh-morph/rules/noun_classes.toml` describes rules no native speaker
 * has checked, and the reviewer is validating two things at once — whether the
 * explanation is clear, and whether the claim is true. The row says which.
 */
export interface NewGrammarNote {
  readonly skillId: string;
  readonly slug: string;
  readonly order?: number | undefined;
  readonly rowHeaderKey?: string | undefined;
  readonly caveat?: string | null | undefined;
  readonly origin: Origin;
}

export interface GrammarNotePatch {
  readonly slug?: string | undefined;
  readonly order?: number | undefined;
  readonly rowHeaderKey?: string | undefined;
  readonly caveat?: string | null | undefined;
}

export interface NewGrammarNoteBody {
  readonly sourceLang: SourceLang;
  readonly title: string;
  readonly rule: string;
  readonly correction?: string | null | undefined;
  readonly origin: Origin;
}

/**
 * One cell of a note. `surfaceForm` is written by the caller, and the caller
 * is expected to have taken it from the lexicon verbatim or from `xh-morph`
 * (`packages/content/src/grammar.ts` is the path that does). This repository
 * does not compose isiXhosa and has no way to check that one was composed;
 * what it does enforce is that the cells replace the note's old ones
 * wholesale, so an edit can never leave half a paradigm behind.
 */
export interface GrammarCellInput {
  readonly role: GrammarCellRole;
  readonly order: number;
  readonly rowLabel?: string | undefined;
  readonly colKey: string;
  readonly surfaceForm: string;
  readonly morphemes?: readonly string[] | undefined;
  readonly lexemeId?: string | null | undefined;
  readonly audioAssetId?: string | null | undefined;
}

/** The editor's view of one note: every status, both languages, all its cells. */
export interface EditorGrammarNote {
  readonly id: string;
  readonly skillId: string;
  readonly skillSlug: string;
  readonly skillTitleKey: string;
  readonly unitSlug: string;
  readonly slug: string;
  readonly order: number;
  readonly rowHeaderKey: string;
  readonly caveat: string | null;
  readonly status: Status;
  readonly updatedAt: string;
  readonly bodies: ReadonlyArray<{
    readonly id: string;
    readonly sourceLang: SourceLang;
    readonly title: string;
    readonly rule: string;
    readonly correction: string | null;
    readonly status: Status;
  }>;
  readonly cells: ReadonlyArray<{
    readonly id: string;
    readonly role: GrammarCellRole;
    readonly order: number;
    readonly rowLabel: string;
    readonly colKey: string;
    readonly surfaceForm: string;
    readonly morphemes: readonly string[];
    readonly lexemeId: string | null;
    readonly audioAssetId: string | null;
  }>;
}

const PROTECTED_KEYS = new Set([
  "status",
  "createdBy",
  "approvedBy",
  "approvedAt",
  "id",
  "createdAt",
]);

/** Defence in depth: strip anything that could touch the status spine, even from untyped callers. */
function stripProtected<T extends object>(patch: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (!PROTECTED_KEYS.has(k)) out[k] = v;
  return out as T;
}

export interface NewGloss {
  readonly sourceLang: SourceLang;
  readonly gloss: string;
  readonly usageNote?: string | null | undefined;
  readonly contrastiveNote?: string | null | undefined;
  readonly origin: Origin;
  /**
   * Which machine wrote an `llm` draft, e.g. `google-translate-v2`. Not a
   * column: it goes into the revision entry with the rest of the input, which
   * is where "who suggested this" is answered for every row.
   */
  readonly provenance?: string | undefined;
}

export interface NewSentence {
  /** The language the sentence is in. Omitted means the default course's language. */
  readonly targetLang?: string | undefined;
  readonly textXh: string;
  readonly register?: Register | undefined;
  readonly cefrBand?: CefrBand | null | undefined;
  readonly grammarTags?: Record<string, unknown> | undefined;
  readonly source: string;
  readonly sourceRef?: string | null | undefined;
  readonly licence: string;
  readonly origin: Origin;
}

export interface SentenceToken {
  readonly position: number;
  readonly lexemeId: string;
  readonly surfaceForm: string;
  /** Set by the caller after asking xh-morph; never inferred here. */
  readonly morphVerified: boolean;
  readonly irregular?: boolean | undefined;
  readonly irregularNote?: string | null | undefined;
}

export interface NewAudioAsset {
  readonly targetKind: "lexeme" | "sentence" | "click_drill" | "click";
  readonly targetId: string;
  readonly speakerId?: string | null | undefined;
  readonly tier: AudioTier;
  readonly r2Key: string;
  readonly sha256: string;
  readonly durationMs: number;
  readonly lufs: number;
  readonly peakDbfs: number;
  readonly codec: string;
  readonly sampleRate: number;
  readonly licence: string;
  readonly provenance?: Record<string, unknown> | undefined;
  readonly manifest?: AudioManifest | null | undefined;
}

export interface TransitionRequest {
  readonly kind: EntityKind;
  readonly id: string;
  readonly to: Status;
  readonly note?: string;
}

export type TransitionOutcome =
  | { readonly ok: true; readonly status: Status }
  | { readonly ok: false; readonly reason: string; readonly gate?: GateResult };

/** One transition applied to many rows of the same kind. */
export interface BulkTransitionRequest {
  readonly kind: EntityKind;
  readonly ids: readonly string[];
  readonly to: Status;
  readonly note?: string;
}

export type BulkTransitionOutcome = TransitionOutcome & { readonly id: string };

export type ReviewFilter = "all" | "mine" | "unassigned";

export interface ReviewQueueRow {
  readonly entityKind: EntityKind;
  readonly entityId: string;
  readonly lexemeId: string | null;
  readonly label: string;
  readonly status: Status;
  readonly createdBy: string | null;
  readonly updatedAt: string;
  readonly assignedTo: string | null;
  readonly assignedToName: string | null;
  readonly assignedAt: string | null;
  readonly assignedBy: string | null;
  readonly assignedByName: string | null;
  readonly priority: number;
  readonly notes: string | null;
  /** Set for a bare-click recording: the click letter it was recorded against. */
  readonly clickLetter: string | null;
  /** The creator's display name; `createdBy` is their id. */
  readonly createdByName: string | null;
  /** For a recording: what it is of, by whom, and where the file is. */
  readonly audio: {
    readonly targetKind: string;
    readonly targetId: string;
    readonly targetText: string | null;
    readonly tier: string;
    readonly speakerName: string | null;
    readonly r2Key: string;
  } | null;
  /** For an exercise: its type, and a culture card's English title. */
  readonly exercise: { readonly type: string; readonly title: string | null } | null;
}

/** A culture card's English title, for the review queue's label. */
function cultureTitleOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { type?: unknown; title?: Record<string, unknown> };
  if (p.type !== "culture_card" || !p.title) return null;
  const en = p.title["en"];
  return typeof en === "string" && en.trim() !== "" ? en : null;
}

export interface EditorialUser {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly Role[];
}

export interface AssignReviewRequest {
  readonly kind: EntityKind;
  readonly id: string;
  /** null releases the item. */
  readonly assignedTo: string | null;
}

export interface ReviewAssignmentState {
  readonly assignedTo: string | null;
  readonly assignedAt: string | null;
  readonly assignedBy: string | null;
}

export function editorRepo(db: Db, actor: Actor, deps: EditorDeps = { morph: noMorph }) {
  assertEditorial(actor);

  async function nounClassIdFor(label: string | null | undefined): Promise<string | null> {
    if (!label) return null;
    const [row] = await db
      .select({ id: nounClasses.id })
      .from(nounClasses)
      .where(eq(nounClasses.label, label))
      .limit(1);
    if (!row) throw new RepoError("invalid", `unknown noun class ${label}`);
    return row.id;
  }

  async function sourceLanguages(): Promise<string[]> {
    const rows = await db
      .select({ code: languages.code })
      .from(languages)
      .where(eq(languages.isSource, true));
    return rows.map((r) => r.code);
  }

  /**
   * The course a row is created against when the caller names none. The
   * dashboard always sends one; the CLI, the seed and the ingest adapters
   * fall back to the default course so a single-course deployment needs no
   * ceremony (ARCHITECTURE section 2.6).
   */
  async function defaultCourse(): Promise<{ id: string; targetLang: string }> {
    const [flagged] = await db
      .select({ id: courses.id, targetLang: courses.targetLang })
      .from(courses)
      .where(eq(courses.isDefault, true))
      .limit(1);
    if (flagged) return flagged;
    const [first] = await db
      .select({ id: courses.id, targetLang: courses.targetLang })
      .from(courses)
      .orderBy(asc(courses.order))
      .limit(1);
    if (!first) throw new RepoError("not_found", "no course exists to create content against");
    return first;
  }

  async function courseById(courseId: string): Promise<{ id: string; targetLang: string }> {
    const [row] = await db
      .select({ id: courses.id, targetLang: courses.targetLang })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);
    if (!row) throw new RepoError("not_found", `course ${courseId}`);
    return row;
  }

  /** The language a row is in, defaulting to the default course's. */
  async function targetLangOf(explicit: string | null | undefined): Promise<string> {
    if (explicit) return explicit;
    return (await defaultCourse()).targetLang;
  }

  async function revision(
    kind: EntityKind,
    id: string,
    diff: Record<string, unknown>,
    note: string | null = null,
  ) {
    await db
      .insert(contentRevisions)
      .values({ entityKind: kind, entityId: id, diff, actorId: actor.id, note });
  }

  // ---- notes ---------------------------------------------------------------

  /**
   * A note on a word, a sentence or a bare click at any status, usually a
   * speaker saying what is wrong in the studio. It changes nothing but the
   * history: the row keeps its status, and an editor decides what to do
   * about it. A click has no row; its id must be one of `CLICK_SOUNDS`.
   */
  async function addNote(input: {
    kind: "lexeme" | "sentence" | "click";
    id: string;
    note: string;
  }): Promise<void> {
    assertEditorial(actor);
    const note = input.note.trim();
    if (!note) throw new RepoError("invalid", "a note needs text");
    const [row] =
      input.kind === "click"
        ? clickSoundById(input.id)
          ? [{ id: input.id }]
          : []
        : input.kind === "lexeme"
          ? await db
              .select({ id: lexemes.id })
              .from(lexemes)
              .where(eq(lexemes.id, input.id))
              .limit(1)
          : await db
              .select({ id: sentences.id })
              .from(sentences)
              .where(eq(sentences.id, input.id))
              .limit(1);
    if (!row) throw new RepoError("not_found", `${input.kind} ${input.id}`);
    await revision(input.kind, input.id, { note: true }, note);
  }

  /** The latest notes, newest first, with the word or sentence as it reads now. */
  async function recentNotes(limit = 20): Promise<ContentNote[]> {
    assertEditorial(actor);
    const rows = await db
      .select({
        kind: contentRevisions.entityKind,
        id: contentRevisions.entityId,
        note: contentRevisions.note,
        at: contentRevisions.createdAt,
        authorName: users.name,
        lemma: lexemes.lemma,
        sentence: sentences.textXh,
      })
      .from(contentRevisions)
      .leftJoin(users, eq(users.id, contentRevisions.actorId))
      .leftJoin(
        lexemes,
        and(eq(contentRevisions.entityKind, "lexeme"), eq(lexemes.id, contentRevisions.entityId)),
      )
      .leftJoin(
        sentences,
        and(
          eq(contentRevisions.entityKind, "sentence"),
          eq(sentences.id, contentRevisions.entityId),
        ),
      )
      .where(
        and(
          inArray(contentRevisions.entityKind, ["lexeme", "sentence", "click"]),
          sql`${contentRevisions.diff} ? 'note'`,
        ),
      )
      .orderBy(desc(contentRevisions.createdAt))
      .limit(Math.min(Math.max(limit, 1), 100));
    return rows.flatMap((r) => {
      const text =
        r.kind === "click" ? (clickSoundById(r.id)?.letter ?? null) : (r.lemma ?? r.sentence);
      if (!r.note || !text) return [];
      return [
        {
          kind: r.kind as "lexeme" | "sentence" | "click",
          id: r.id,
          text,
          note: r.note,
          authorName: r.authorName ?? null,
          at: r.at.toISOString(),
        },
      ];
    });
  }

  // ---- lexicon -------------------------------------------------------------

  async function createLexeme(input: NewLexeme): Promise<string> {
    assertEditorial(actor);
    const nounClassId = await nounClassIdFor(input.nounClassLabel);
    if (input.pos === "noun" && !nounClassId)
      throw new RepoError("invalid", "a noun needs a noun class");
    const [row] = await db
      .insert(lexemes)
      .values({
        targetLang: await targetLangOf(input.targetLang),
        lemma: input.lemma.trim(),
        pos: input.pos,
        nounClassId,
        isPlural: input.isPlural ?? false,
        infinitive: input.infinitive ?? null,
        stem: input.stem ?? null,
        register: input.register ?? "standard",
        cefrBand: input.cefrBand ?? null,
        frequencyRank: input.frequencyRank ?? null,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        licence: input.licence,
        attribution: [...(input.attribution ?? [])],
        status: initialStatus(input.origin),
        createdBy: actor.id,
      })
      .returning({ id: lexemes.id });
    if (!row) throw new RepoError("conflict", "insert returned no row");
    await revision("lexeme", row.id, { created: input });
    return row.id;
  }

  async function updateLexeme(id: string, patch: LexemePatch): Promise<void> {
    assertEditorial(actor);
    const clean = stripProtected(patch);
    const { nounClassLabel, ...rest } = clean;
    const values: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) values[k] = v;
    if (nounClassLabel !== undefined) values["nounClassId"] = await nounClassIdFor(nounClassLabel);
    const updated = await db
      .update(lexemes)
      .set(values)
      .where(eq(lexemes.id, id))
      .returning({ id: lexemes.id });
    if (updated.length === 0) throw new RepoError("not_found", `lexeme ${id}`);
    await revision("lexeme", id, { patch: clean });
  }

  async function upsertGloss(lexemeId: string, input: NewGloss): Promise<string> {
    assertEditorial(actor);
    const status = initialStatus(input.origin);
    const [row] = await db
      .insert(glosses)
      .values({
        lexemeId,
        sourceLang: input.sourceLang,
        gloss: input.gloss.trim(),
        usageNote: input.usageNote ?? null,
        contrastiveNote: input.contrastiveNote ?? null,
        status,
        createdBy: actor.id,
      })
      .onConflictDoUpdate({
        target: [glosses.lexemeId, glosses.sourceLang],
        set: {
          gloss: input.gloss.trim(),
          usageNote: input.usageNote ?? null,
          contrastiveNote: input.contrastiveNote ?? null,
          // Editing a gloss puts it back to its origin status; a published gloss goes back through review.
          status,
          approvedBy: null,
          approvedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: glosses.id });
    if (!row) throw new RepoError("conflict", "upsert returned no row");
    await revision("gloss", row.id, { upsert: input });
    return row.id;
  }

  async function addLink(
    fromId: string,
    toId: string,
    kind: LinkKind,
    sourceKind: string | null = null,
  ): Promise<void> {
    assertEditorial(actor);
    await db.insert(lexemeLinks).values({ fromId, toId, kind, sourceKind }).onConflictDoNothing();
  }

  async function createSentence(
    input: NewSentence,
    tokens: readonly SentenceToken[] = [],
  ): Promise<string> {
    assertEditorial(actor);
    const [row] = await db
      .insert(sentences)
      .values({
        targetLang: await targetLangOf(input.targetLang),
        textXh: input.textXh.trim(),
        register: input.register ?? "standard",
        cefrBand: input.cefrBand ?? null,
        grammarTags: input.grammarTags ?? {},
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        licence: input.licence,
        status: initialStatus(input.origin),
        createdBy: actor.id,
      })
      // sentences_text_source_uq: the same text from the same source already
      // exists, and one row is what we want. The caller gets a 409, not a 500.
      .onConflictDoNothing({ target: [sentences.targetLang, sentences.textXh, sentences.source] })
      .returning({ id: sentences.id });
    if (!row)
      throw new RepoError(
        "conflict",
        `a sentence with this text already exists for source ${input.source}`,
        { textXh: input.textXh.trim(), source: input.source },
      );
    if (tokens.length > 0) await setSentenceTokens(row.id, tokens);
    await revision("sentence", row.id, { created: input });
    return row.id;
  }

  /** Field edits only; status keys are stripped like everywhere else. */
  async function updateSentence(id: string, patch: SentencePatch): Promise<void> {
    assertEditorial(actor);
    const clean = stripProtected(patch);
    const values: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(clean)) {
      if (v === undefined) continue;
      values[k] = k === "textXh" && typeof v === "string" ? v.trim() : v;
    }
    const updated = await db
      .update(sentences)
      .set(values)
      .where(eq(sentences.id, id))
      .returning({ id: sentences.id });
    if (updated.length === 0) throw new RepoError("not_found", `sentence ${id}`);
    await revision("sentence", id, { patch: clean });
  }

  /**
   * Replaces the token list. `morphVerified` must come from the caller's
   * xh-morph check, never from a client; the publish gate reads it.
   */
  async function setSentenceTokens(
    sentenceId: string,
    tokens: readonly SentenceToken[],
  ): Promise<void> {
    assertEditorial(actor);
    const [exists] = await db
      .select({ id: sentences.id })
      .from(sentences)
      .where(eq(sentences.id, sentenceId))
      .limit(1);
    if (!exists) throw new RepoError("not_found", `sentence ${sentenceId}`);
    await db.transaction(async (tx) => {
      await tx.delete(sentenceLexemes).where(eq(sentenceLexemes.sentenceId, sentenceId));
      if (tokens.length > 0) {
        await tx.insert(sentenceLexemes).values(
          tokens.map((t) => ({
            sentenceId,
            lexemeId: t.lexemeId,
            position: t.position,
            surfaceForm: t.surfaceForm,
            morphVerified: t.morphVerified,
            irregular: t.irregular ?? false,
            irregularNote: t.irregularNote ?? null,
          })),
        );
      }
    });
    await revision("sentence", sentenceId, {
      tokens: tokens.map((t) => ({
        position: t.position,
        lexemeId: t.lexemeId,
        surfaceForm: t.surfaceForm,
        morphVerified: t.morphVerified,
        irregular: t.irregular ?? false,
      })),
    });
  }

  async function upsertSentenceGloss(
    sentenceId: string,
    input: NewGloss & { readonly literalGloss?: string | null },
  ): Promise<string> {
    assertEditorial(actor);
    const status = initialStatus(input.origin);
    const [row] = await db
      .insert(sentenceGlosses)
      .values({
        sentenceId,
        sourceLang: input.sourceLang,
        gloss: input.gloss.trim(),
        literalGloss: input.literalGloss ?? null,
        status,
        createdBy: actor.id,
      })
      .onConflictDoUpdate({
        target: [sentenceGlosses.sentenceId, sentenceGlosses.sourceLang],
        set: {
          gloss: input.gloss.trim(),
          literalGloss: input.literalGloss ?? null,
          status,
          approvedBy: null,
          approvedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: sentenceGlosses.id });
    if (!row) throw new RepoError("conflict", "upsert returned no row");
    return row.id;
  }

  // ---- audio ---------------------------------------------------------------

  /** Processed audio enters review directly (ARCHITECTURE section 5). Speaker consent is required. */
  /**
   * Deletes a take that never reached a learner: a test, a false start, a
   * recording of the wrong word. Published audio is retired instead, never
   * deleted. Only the person who uploaded it or an admin may; the history
   * keeps what it was. Returns the object key so the caller removes the file.
   */
  async function discardAudio(id: string): Promise<{ r2Key: string }> {
    assertEditorial(actor);
    const [row] = await db
      .select({
        status: audioAssets.status,
        r2Key: audioAssets.r2Key,
        createdBy: audioAssets.createdBy,
        targetKind: audioAssets.targetKind,
        targetId: audioAssets.targetId,
        speakerId: audioAssets.speakerId,
      })
      .from(audioAssets)
      .where(eq(audioAssets.id, id))
      .limit(1);
    if (!row) throw new RepoError("not_found", `audio ${id}`);
    if (row.status === "published" || row.status === "retired")
      throw new RepoError(
        "conflict",
        `audio ${id} is ${row.status}; retire published audio instead`,
      );
    if (row.createdBy !== actor.id && !actor.roles.includes("admin"))
      throw new RepoError("forbidden", "only the uploader or an admin can delete a take");
    await revision("audio_asset", id, {
      deleted: {
        status: row.status,
        targetKind: row.targetKind,
        targetId: row.targetId,
        speakerId: row.speakerId,
      },
    });
    await db.delete(audioAssets).where(eq(audioAssets.id, id));
    return { r2Key: row.r2Key };
  }

  async function createAudioAsset(input: NewAudioAsset): Promise<string> {
    assertEditorial(actor);
    // A bare click has no row of its own; its target must be one of the fixed
    // CLICK_SOUNDS ids, and only a native speaker in the studio records it.
    if (input.targetKind === "click") {
      if (!clickSoundById(input.targetId))
        throw new RepoError("not_found", `click ${input.targetId}`);
      if (input.tier !== "1_native_studio")
        throw new RepoError("invalid", "a bare click is recorded in the studio (tier 1) only");
    }
    if (input.speakerId) {
      const [sp] = await db
        .select({
          consentRecordedAt: speakers.consentRecordedAt,
          consentScope: speakers.consentScope,
        })
        .from(speakers)
        .where(eq(speakers.id, input.speakerId))
        .limit(1);
      if (!sp) throw new RepoError("not_found", `speaker ${input.speakerId}`);
      if (!sp.consentRecordedAt || !sp.consentScope) {
        throw new RepoError(
          "consent_missing",
          `speaker ${input.speakerId} has no recorded consent`,
        );
      }
    } else if (input.tier === "1_native_studio") {
      throw new RepoError("consent_missing", "tier-1 audio needs a speaker with consent on file");
    }
    const [row] = await db
      .insert(audioAssets)
      .values({
        r2Key: input.r2Key,
        targetKind: input.targetKind,
        targetId: input.targetId,
        speakerId: input.speakerId ?? null,
        tier: input.tier,
        durationMs: input.durationMs,
        lufs: input.lufs,
        peakDbfs: input.peakDbfs,
        sha256: input.sha256,
        codec: input.codec,
        sampleRate: input.sampleRate,
        licence: input.licence,
        provenance: input.provenance ?? {},
        manifest: input.manifest ?? null,
        status: "in_review",
        createdBy: actor.id,
      })
      .returning({ id: audioAssets.id });
    if (!row) throw new RepoError("conflict", "insert returned no row");
    await revision("audio_asset", row.id, { created: { ...input, manifest: undefined } });
    return row.id;
  }

  // ---- curriculum ----------------------------------------------------------

  /** A unit is created against a course; omitting one means the default course. */
  async function createUnit(input: {
    courseId?: string | undefined;
    slug: string;
    titleKey: string;
    order: number;
    cefrBand: CefrBand;
    prerequisiteUnitId?: string | null | undefined;
  }): Promise<string> {
    assertEditorial(actor);
    const course = input.courseId ? await courseById(input.courseId) : await defaultCourse();
    const { courseId: _requested, ...rest } = input;
    const [row] = await db
      .insert(units)
      .values({
        ...rest,
        courseId: course.id,
        prerequisiteUnitId: input.prerequisiteUnitId ?? null,
        status: "draft",
        createdBy: actor.id,
      })
      .returning({ id: units.id });
    if (!row) throw new RepoError("conflict", "insert returned no row");
    await revision("unit", row.id, { created: { ...rest, courseId: course.id } });
    return row.id;
  }

  async function createSkill(input: {
    unitId: string;
    slug: string;
    titleKey: string;
    order: number;
    kind: SkillKind;
  }): Promise<string> {
    assertEditorial(actor);
    const [row] = await db
      .insert(skills)
      .values({ ...input, status: "draft", createdBy: actor.id })
      .returning({ id: skills.id });
    if (!row) throw new RepoError("conflict", "insert returned no row");
    await revision("skill", row.id, { created: input });
    return row.id;
  }

  async function createLesson(input: {
    skillId: string;
    order: number;
    estimatedMinutes?: number | undefined;
  }): Promise<string> {
    assertEditorial(actor);
    const [row] = await db
      .insert(lessons)
      .values({
        skillId: input.skillId,
        order: input.order,
        estimatedMinutes: input.estimatedMinutes ?? 5,
        status: "draft",
        createdBy: actor.id,
      })
      .returning({ id: lessons.id });
    if (!row) throw new RepoError("conflict", "insert returned no row");
    await revision("lesson", row.id, { created: input });
    return row.id;
  }

  /**
   * Validates the payload against the schema for `type`; denormalises the
   * referenced ids. `origin: "llm"` (a culture card a model wrote) starts the
   * row at `ai_draft`; anything else starts at `draft`.
   */
  async function createExercise(input: {
    lessonId: string;
    order: number;
    type: ExerciseType;
    payload: unknown;
    note?: string | null | undefined;
    origin?: Origin | undefined;
  }): Promise<string> {
    assertEditorial(actor);
    const decoded = decodePayloadForType(input.type, input.payload);
    if (Either.isLeft(decoded)) throw new RepoError("invalid", `exercise payload: ${decoded.left}`);
    const ids = referencedIds(decoded.right);
    const [row] = await db
      .insert(exercises)
      .values({
        lessonId: input.lessonId,
        order: input.order,
        type: input.type,
        payload: input.payload as (typeof exercises.$inferInsert)["payload"],
        lexemeIds: [...ids.lexemeIds],
        sentenceIds: [...ids.sentenceIds],
        audioAssetIds: [...ids.audioAssetIds],
        note: input.note ?? null,
        status: initialStatus(input.origin ?? "human"),
        createdBy: actor.id,
      })
      .returning({ id: exercises.id });
    if (!row) throw new RepoError("conflict", "insert returned no row");
    await revision("exercise", row.id, {
      created: { lessonId: input.lessonId, order: input.order, type: input.type },
    });
    return row.id;
  }

  // ---- grammar notes (docs/GRAMMAR.md) -------------------------------------

  async function createGrammarNote(input: NewGrammarNote): Promise<string> {
    assertEditorial(actor);
    const [row] = await db
      .insert(grammarNotes)
      .values({
        skillId: input.skillId,
        slug: input.slug.trim(),
        order: input.order ?? 1,
        rowHeaderKey: input.rowHeaderKey ?? "class",
        caveat: input.caveat ?? null,
        status: initialStatus(input.origin),
        createdBy: actor.id,
      })
      .returning({ id: grammarNotes.id });
    if (!row) throw new RepoError("conflict", "insert returned no row");
    await revision("grammar_note", row.id, { created: { ...input } });
    return row.id;
  }

  async function updateGrammarNote(id: string, patch: GrammarNotePatch): Promise<void> {
    assertEditorial(actor);
    const clean = stripProtected(patch);
    const values: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(clean)) if (v !== undefined) values[k] = v;
    const updated = await db
      .update(grammarNotes)
      .set(values)
      .where(eq(grammarNotes.id, id))
      .returning({ id: grammarNotes.id });
    if (updated.length === 0) throw new RepoError("not_found", `grammar_note ${id}`);
    await revision("grammar_note", id, { patch: clean });
  }

  /**
   * Writes one language of a note. Like a gloss, editing it puts it back to
   * its origin status: a published body that an editor changes goes through
   * review again rather than changing under a learner's feet.
   */
  async function upsertGrammarNoteBody(
    grammarNoteId: string,
    input: NewGrammarNoteBody,
  ): Promise<string> {
    assertEditorial(actor);
    const status = initialStatus(input.origin);
    const fields = {
      title: input.title.trim(),
      rule: input.rule.trim(),
      correction: input.correction?.trim() ?? null,
    };
    const [row] = await db
      .insert(grammarNoteBodies)
      .values({
        grammarNoteId,
        sourceLang: input.sourceLang,
        ...fields,
        status,
        createdBy: actor.id,
      })
      .onConflictDoUpdate({
        target: [grammarNoteBodies.grammarNoteId, grammarNoteBodies.sourceLang],
        set: { ...fields, status, approvedBy: null, approvedAt: null, updatedAt: new Date() },
      })
      .returning({ id: grammarNoteBodies.id });
    if (!row) throw new RepoError("conflict", "upsert returned no row");
    await revision("grammar_note_body", row.id, { upsert: input });
    return row.id;
  }

  /** Replaces a note's cells wholesale, so an edit never leaves half a paradigm. */
  async function setGrammarNoteCells(
    grammarNoteId: string,
    cells: readonly GrammarCellInput[],
  ): Promise<void> {
    assertEditorial(actor);
    await db.transaction(async (tx) => {
      await tx.delete(grammarNoteCells).where(eq(grammarNoteCells.grammarNoteId, grammarNoteId));
      if (cells.length > 0) {
        await tx.insert(grammarNoteCells).values(
          cells.map((c) => ({
            grammarNoteId,
            role: c.role,
            order: c.order,
            rowLabel: c.rowLabel ?? "",
            colKey: c.colKey,
            surfaceForm: c.surfaceForm,
            morphemes: [...(c.morphemes ?? [])],
            lexemeId: c.lexemeId ?? null,
            audioAssetId: c.audioAssetId ?? null,
          })),
        );
      }
    });
    await revision("grammar_note", grammarNoteId, { cells: cells.length });
  }

  /** One note by its skill and slug, or null. What makes the loader idempotent. */
  async function findGrammarNote(
    skillId: string,
    slug: string,
  ): Promise<{ id: string; status: Status } | null> {
    assertEditorial(actor);
    const [row] = await db
      .select({ id: grammarNotes.id, status: grammarNotes.status })
      .from(grammarNotes)
      .where(and(eq(grammarNotes.skillId, skillId), eq(grammarNotes.slug, slug)))
      .limit(1);
    return row ?? null;
  }

  /** Every note of a course (or of every course), at every status, for the dashboard. */
  async function grammarNoteTree(courseId?: string | undefined): Promise<EditorGrammarNote[]> {
    assertEditorial(actor);
    const course = courseId ? await courseById(courseId) : null;
    const noteRows = await db
      .select({
        id: grammarNotes.id,
        skillId: grammarNotes.skillId,
        slug: grammarNotes.slug,
        order: grammarNotes.order,
        rowHeaderKey: grammarNotes.rowHeaderKey,
        caveat: grammarNotes.caveat,
        status: grammarNotes.status,
        updatedAt: grammarNotes.updatedAt,
        skillSlug: skills.slug,
        skillTitleKey: skills.titleKey,
        skillOrder: skills.order,
        unitSlug: units.slug,
        unitOrder: units.order,
      })
      .from(grammarNotes)
      .innerJoin(skills, eq(skills.id, grammarNotes.skillId))
      .innerJoin(units, eq(units.id, skills.unitId))
      .where(course ? eq(units.courseId, course.id) : sql`true`)
      .orderBy(asc(units.order), asc(skills.order), asc(grammarNotes.order));
    const ids = noteRows.map((n) => n.id);
    const bodyRows =
      ids.length === 0
        ? []
        : await db
            .select()
            .from(grammarNoteBodies)
            .where(inArray(grammarNoteBodies.grammarNoteId, ids));
    const cellRows =
      ids.length === 0
        ? []
        : await db
            .select()
            .from(grammarNoteCells)
            .where(inArray(grammarNoteCells.grammarNoteId, ids))
            .orderBy(asc(grammarNoteCells.order));
    return noteRows.map((n) => ({
      id: n.id,
      skillId: n.skillId,
      skillSlug: n.skillSlug,
      skillTitleKey: n.skillTitleKey,
      unitSlug: n.unitSlug,
      slug: n.slug,
      order: n.order,
      rowHeaderKey: n.rowHeaderKey,
      caveat: n.caveat,
      status: n.status,
      updatedAt: n.updatedAt.toISOString(),
      bodies: bodyRows
        .filter((b) => b.grammarNoteId === n.id)
        .map((b) => ({
          id: b.id,
          sourceLang: b.sourceLang,
          title: b.title,
          rule: b.rule,
          correction: b.correction,
          status: b.status,
        })),
      cells: cellRows
        .filter((c) => c.grammarNoteId === n.id)
        .map((c) => ({
          id: c.id,
          role: c.role,
          order: c.order,
          rowLabel: c.rowLabel,
          colKey: c.colKey,
          surfaceForm: c.surfaceForm,
          morphemes: c.morphemes,
          lexemeId: c.lexemeId,
          audioAssetId: c.audioAssetId,
        })),
    }));
  }

  // ---- curriculum: updates, deletion of drafts, the editor's tree ----------

  type CurriculumKind = "unit" | "skill" | "lesson" | "exercise";
  const curriculumTables = {
    unit: units,
    skill: skills,
    lesson: lessons,
    exercise: exercises,
  } as const;

  async function patchCurriculum(
    kind: CurriculumKind,
    id: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    assertEditorial(actor);
    const clean = stripProtected(patch);
    const values: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(clean)) if (v !== undefined) values[k] = v;
    const table = curriculumTables[kind];
    const updated = await db
      .update(table)
      .set(values)
      .where(eq(table.id, id))
      .returning({ id: table.id });
    if (updated.length === 0) throw new RepoError("not_found", `${kind} ${id}`);
    await revision(kind, id, { patch: clean });
  }

  async function updateUnit(
    id: string,
    patch: {
      slug?: string | undefined;
      titleKey?: string | undefined;
      order?: number | undefined;
      cefrBand?: CefrBand | undefined;
      prerequisiteUnitId?: string | null | undefined;
    },
  ): Promise<void> {
    if (patch.prerequisiteUnitId === id)
      throw new RepoError("invalid", "a unit cannot require itself");
    await patchCurriculum("unit", id, patch);
  }

  async function updateSkill(
    id: string,
    patch: {
      slug?: string | undefined;
      titleKey?: string | undefined;
      order?: number | undefined;
      kind?: SkillKind | undefined;
    },
  ): Promise<void> {
    await patchCurriculum("skill", id, patch);
  }

  async function updateLesson(
    id: string,
    patch: { order?: number | undefined; estimatedMinutes?: number | undefined },
  ): Promise<void> {
    await patchCurriculum("lesson", id, patch);
  }

  /** Re-validates the payload against the schema for the (possibly new) type and recomputes the denormalised ids. */
  async function updateExercise(
    id: string,
    patch: {
      order?: number | undefined;
      type?: ExerciseType | undefined;
      payload?: unknown;
      note?: string | null | undefined;
    },
  ): Promise<void> {
    assertEditorial(actor);
    const values: Record<string, unknown> = {};
    if (patch.order !== undefined) values["order"] = patch.order;
    if (patch.note !== undefined) values["note"] = patch.note;
    if (patch.payload !== undefined || patch.type !== undefined) {
      const [current] = await db
        .select({ type: exercises.type, payload: exercises.payload })
        .from(exercises)
        .where(eq(exercises.id, id))
        .limit(1);
      if (!current) throw new RepoError("not_found", `exercise ${id}`);
      const type = patch.type ?? current.type;
      const payload = patch.payload ?? current.payload;
      const decoded = decodePayloadForType(type, payload);
      if (Either.isLeft(decoded))
        throw new RepoError("invalid", `exercise payload: ${decoded.left}`);
      const ids = referencedIds(decoded.right);
      // A word an exercise names must be a lexicon row: a picker can only offer
      // those, and a hand-made request cannot slip a stray id past it.
      const wanted = [...ids.lexemeIds];
      if (wanted.length > 0) {
        const found = await db
          .select({ id: lexemes.id })
          .from(lexemes)
          .where(inArray(lexemes.id, wanted));
        const known = new Set(found.map((r) => r.id));
        const missing = wanted.filter((w) => !known.has(w));
        if (missing.length > 0)
          throw new RepoError("invalid", `not in the lexicon: ${missing.join(", ")}`);
      }
      values["type"] = type;
      values["payload"] = payload;
      values["lexemeIds"] = [...ids.lexemeIds];
      values["sentenceIds"] = [...ids.sentenceIds];
      values["audioAssetIds"] = [...ids.audioAssetIds];
    }
    await patchCurriculum("exercise", id, values);
  }

  /**
   * Moves a never-published exercise (draft or ai_draft) to another lesson
   * and position. Something a reviewer has seen or a learner can see is not
   * moved under them: retire it and create a new one instead.
   */
  async function moveExercise(id: string, to: { lessonId: string; order: number }): Promise<void> {
    assertEditorial(actor);
    const [row] = await db
      .select({ status: exercises.status, lessonId: exercises.lessonId, order: exercises.order })
      .from(exercises)
      .where(eq(exercises.id, id))
      .limit(1);
    if (!row) throw new RepoError("not_found", `exercise ${id}`);
    if (row.status !== "draft" && row.status !== "ai_draft")
      throw new RepoError("forbidden", `exercise ${id} is ${row.status}; only a draft moves`);
    if (row.lessonId === to.lessonId && row.order === to.order) return;
    await db
      .update(exercises)
      .set({ lessonId: to.lessonId, order: to.order, updatedAt: new Date() })
      .where(eq(exercises.id, id));
    await revision("exercise", id, {
      moved: { from: { lessonId: row.lessonId, order: row.order }, to },
    });
  }

  /** Moves a never-published grammar note to another skill, as `moveExercise` does an exercise. */
  async function moveGrammarNote(
    id: string,
    to: { skillId: string; order: number },
  ): Promise<void> {
    assertEditorial(actor);
    const [row] = await db
      .select({
        status: grammarNotes.status,
        skillId: grammarNotes.skillId,
        order: grammarNotes.order,
      })
      .from(grammarNotes)
      .where(eq(grammarNotes.id, id))
      .limit(1);
    if (!row) throw new RepoError("not_found", `grammar_note ${id}`);
    if (row.status !== "draft" && row.status !== "ai_draft")
      throw new RepoError("forbidden", `grammar_note ${id} is ${row.status}; only a draft moves`);
    if (row.skillId === to.skillId && row.order === to.order) return;
    await db
      .update(grammarNotes)
      .set({ skillId: to.skillId, order: to.order, updatedAt: new Date() })
      .where(eq(grammarNotes.id, id));
    await revision("grammar_note", id, {
      moved: { from: { skillId: row.skillId, order: row.order }, to },
    });
  }

  /**
   * Deletes a unit, skill, lesson or exercise that has never been published
   * (draft or ai_draft only). Children go with it through the foreign keys.
   * Anything that has been in review or published is retired instead.
   */
  async function deleteDraft(kind: CurriculumKind, id: string): Promise<void> {
    assertEditorial(actor);
    const table = curriculumTables[kind];
    const [row] = await db
      .select({ status: table.status })
      .from(table)
      .where(eq(table.id, id))
      .limit(1);
    if (!row) throw new RepoError("not_found", `${kind} ${id}`);
    if (row.status !== "draft" && row.status !== "ai_draft")
      throw new RepoError(
        "forbidden",
        `${kind} ${id} is ${row.status}; retire it instead of deleting`,
      );
    await revision(kind, id, { deleted: { status: row.status } });
    await db.delete(table).where(eq(table.id, id));
  }

  /**
   * Every unit with its skills, lessons and exercises, all statuses, for the
   * dashboard. Scoped to one course when the dashboard names one, so a
   * second curriculum never appears in the tree an editor is editing.
   */
  async function curriculumTree(courseId?: string | undefined): Promise<CurriculumUnit[]> {
    assertEditorial(actor);
    const [unitRows, skillRows, lessonRows, exerciseRows] = await Promise.all([
      courseId
        ? db.select().from(units).where(eq(units.courseId, courseId)).orderBy(asc(units.order))
        : db.select().from(units).orderBy(asc(units.order)),
      db.select().from(skills).orderBy(asc(skills.order)),
      db.select().from(lessons).orderBy(asc(lessons.order)),
      db
        .select({
          id: exercises.id,
          lessonId: exercises.lessonId,
          order: exercises.order,
          type: exercises.type,
          status: exercises.status,
          note: exercises.note,
          lexemeCount: sql<number>`cardinality(${exercises.lexemeIds})::int`,
          updatedAt: exercises.updatedAt,
        })
        .from(exercises)
        .orderBy(asc(exercises.order)),
    ]);
    return unitRows.map((u) => ({
      id: u.id,
      courseId: u.courseId,
      slug: u.slug,
      titleKey: u.titleKey,
      order: u.order,
      cefrBand: u.cefrBand,
      prerequisiteUnitId: u.prerequisiteUnitId,
      status: u.status,
      updatedAt: u.updatedAt.toISOString(),
      skills: skillRows
        .filter((s) => s.unitId === u.id)
        .map((s) => ({
          id: s.id,
          slug: s.slug,
          titleKey: s.titleKey,
          order: s.order,
          kind: s.kind,
          status: s.status,
          lessons: lessonRows
            .filter((l) => l.skillId === s.id)
            .map((l) => ({
              id: l.id,
              order: l.order,
              estimatedMinutes: l.estimatedMinutes,
              status: l.status,
              exercises: exerciseRows
                .filter((e) => e.lessonId === l.id)
                .map((e) => ({
                  id: e.id,
                  order: e.order,
                  type: e.type,
                  status: e.status,
                  note: e.note,
                  lexemeCount: e.lexemeCount,
                  updatedAt: e.updatedAt.toISOString(),
                })),
            })),
        })),
    }));
  }

  // ---- the status spine ----------------------------------------------------

  type StatusRow = Statusable & { id: string };

  const tableFor = {
    lexeme: lexemes,
    gloss: glosses,
    sentence: sentences,
    sentence_gloss: sentenceGlosses,
    audio_asset: audioAssets,
    exercise: exercises,
    lesson: lessons,
    skill: skills,
    unit: units,
    grammar_note: grammarNotes,
    grammar_note_body: grammarNoteBodies,
  } as const;

  function statusKind(kind: EntityKind): StatusKind {
    if (kind === "speaker") throw new RepoError("invalid", "speakers have no status");
    if (kind === "click") throw new RepoError("invalid", "a bare click has no row and no status");
    return kind;
  }

  async function loadStatusRow(kind: EntityKind, id: string): Promise<StatusRow> {
    const t = tableFor[statusKind(kind)];
    const [row] = await db
      .select({
        id: t.id,
        status: t.status,
        createdBy: t.createdBy,
        approvedBy: t.approvedBy,
        approvedAt: t.approvedAt,
      })
      .from(t)
      .where(eq(t.id, id))
      .limit(1);
    if (!row) throw new RepoError("not_found", `${kind} ${id}`);
    return row;
  }

  /**
   * Option tiles that would read the same to a learner (audit M02). Glosses
   * count when a human owns them (draft, in review or published), the same
   * set the lexeme gate accepts, so a collision is caught before the second
   * gloss is even published.
   */
  async function optionCollisionsOf(payload: Parameters<typeof optionLexemeIds>[0]) {
    const ids = [...new Set(optionLexemeIds(payload))];
    if (ids.length < 2) return [];
    const [lemmaRows, glossRows] = await Promise.all([
      db
        .select({ id: lexemes.id, lemma: lexemes.lemma })
        .from(lexemes)
        .where(inArray(lexemes.id, ids)),
      db
        .select({ id: glosses.lexemeId, lang: glosses.sourceLang, gloss: glosses.gloss })
        .from(glosses)
        .where(
          and(
            inArray(glosses.lexemeId, ids),
            inArray(glosses.status, ["draft", "in_review", "published"]),
          ),
        ),
    ]);
    const labels = new Map<string, OptionLabels>(
      lemmaRows.map((r) => [
        r.id,
        {
          lemma: r.lemma,
          glosses: Object.fromEntries(
            glossRows.filter((g) => g.id === r.id).map((g) => [g.lang, g.gloss]),
          ),
        },
      ]),
    );
    return optionCollisions(payload, (id) => labels.get(id));
  }

  async function statusesOf(
    kind: ReferencedEntity["kind"],
    ids: readonly string[],
  ): Promise<ReferencedEntity[]> {
    if (ids.length === 0) return [];
    const t = tableFor[kind];
    const rows = await db
      .select({ id: t.id, status: t.status })
      .from(t)
      .where(inArray(t.id, [...ids]));
    const found = new Map(rows.map((r) => [r.id, r.status]));
    return ids.map((id) => ({ kind, id, status: found.get(id) ?? "draft" }));
  }

  async function gateFor(kind: EntityKind, row: StatusRow): Promise<GateResult> {
    const approval = { createdBy: row.createdBy, approver: actor };
    switch (kind) {
      case "lexeme": {
        const [lx] = await db
          .select({
            targetLang: lexemes.targetLang,
            lemma: lexemes.lemma,
            pos: lexemes.pos,
            licence: lexemes.licence,
            source: lexemes.source,
            nounClass: nounClasses.label,
          })
          .from(lexemes)
          .leftJoin(nounClasses, eq(lexemes.nounClassId, nounClasses.id))
          .where(eq(lexemes.id, row.id))
          .limit(1);
        if (!lx) throw new RepoError("not_found", `lexeme ${row.id}`);
        // A gloss counts only when a human owns it: draft (human-written or human-accepted) or already published.
        const glossRows = await db
          .select({ sourceLang: glosses.sourceLang, status: glosses.status })
          .from(glosses)
          .where(
            and(
              eq(glosses.lexemeId, row.id),
              inArray(glosses.status, ["draft", "in_review", "published"]),
            ),
          );
        const audioRows = await db
          .select({ tier: audioAssets.tier, status: audioAssets.status })
          .from(audioAssets)
          .where(and(eq(audioAssets.targetKind, "lexeme"), eq(audioAssets.targetId, row.id)));
        const links = await db
          .select({ id: lexemeLinks.id })
          .from(lexemeLinks)
          .where(and(eq(lexemeLinks.kind, "plural_of"), inArray(lexemeLinks.fromId, [row.id])))
          .union(
            db
              .select({ id: lexemeLinks.id })
              .from(lexemeLinks)
              .where(and(eq(lexemeLinks.kind, "plural_of"), inArray(lexemeLinks.toId, [row.id]))),
          );
        // Which generator vouches for this language's forms — xh-morph for
        // isiXhosa, nothing for anything else (ARCHITECTURE section 2.6).
        const morphGenerator = deps.morph.generatorFor(lx.targetLang);
        const canGeneratePlural =
          morphGenerator !== null && lx.pos === "noun" && lx.nounClass
            ? await deps.morph.canGeneratePlural(lx.targetLang, lx.lemma, lx.nounClass)
            : null;
        return lexemePublishGate(
          {
            ...approval,
            morphGenerator,
            pos: lx.pos,
            nounClass: lx.nounClass,
            hasPluralLink: links.length > 0,
            canGeneratePlural,
            glossLanguages: glossRows.map((g) => g.sourceLang),
            audio: audioRows,
            licence: lx.licence,
            source: lx.source,
          },
          { sourceLanguages: await sourceLanguages() },
        );
      }
      case "sentence": {
        const [s] = await db
          .select({
            targetLang: sentences.targetLang,
            licence: sentences.licence,
            source: sentences.source,
          })
          .from(sentences)
          .where(eq(sentences.id, row.id))
          .limit(1);
        if (!s) throw new RepoError("not_found", `sentence ${row.id}`);
        const glossRows = await db
          .select({ sourceLang: sentenceGlosses.sourceLang })
          .from(sentenceGlosses)
          .where(
            and(
              eq(sentenceGlosses.sentenceId, row.id),
              inArray(sentenceGlosses.status, ["draft", "in_review", "published"]),
            ),
          );
        const audioRows = await db
          .select({ tier: audioAssets.tier, status: audioAssets.status })
          .from(audioAssets)
          .where(and(eq(audioAssets.targetKind, "sentence"), eq(audioAssets.targetId, row.id)));
        const tokens = await db
          .select({
            lexemeId: sentenceLexemes.lexemeId,
            morphVerified: sentenceLexemes.morphVerified,
            irregular: sentenceLexemes.irregular,
            note: sentenceLexemes.irregularNote,
            status: lexemes.status,
          })
          .from(sentenceLexemes)
          .innerJoin(lexemes, eq(sentenceLexemes.lexemeId, lexemes.id))
          .where(eq(sentenceLexemes.sentenceId, row.id));
        return sentencePublishGate(
          {
            ...approval,
            morphGenerator: deps.morph.generatorFor(s.targetLang),
            glossLanguages: glossRows.map((g) => g.sourceLang),
            audio: audioRows,
            licence: s.licence,
            source: s.source,
            lexemes: tokens.map((t) => ({
              lexemeId: t.lexemeId,
              status: t.status,
              surfaceForm: { morphVerified: t.morphVerified, irregular: t.irregular, note: t.note },
            })),
          },
          { sourceLanguages: await sourceLanguages() },
        );
      }
      case "exercise": {
        const [ex] = await db
          .select({
            type: exercises.type,
            payload: exercises.payload,
            lexemeIds: exercises.lexemeIds,
            sentenceIds: exercises.sentenceIds,
            audioAssetIds: exercises.audioAssetIds,
          })
          .from(exercises)
          .where(eq(exercises.id, row.id))
          .limit(1);
        if (!ex) throw new RepoError("not_found", `exercise ${row.id}`);
        const decoded = decodePayloadForType(ex.type, ex.payload);
        if (Either.isLeft(decoded)) {
          return {
            ok: false,
            failures: [
              {
                code: "referenced_entity_not_published",
                detail: `invalid payload: ${decoded.left}`,
              },
            ],
          };
        }
        const drillGaps = missingDrillAudio(decoded.right);
        const refs = [
          ...(await statusesOf("lexeme", ex.lexemeIds)),
          ...(await statusesOf("sentence", ex.sentenceIds)),
          ...(await statusesOf("audio_asset", ex.audioAssetIds)),
          ...drillGaps.map((g): ReferencedEntity => ({
            kind: "audio_asset",
            id: `missing:${g}`,
            status: "draft",
          })),
        ];
        // click_identify plays bare clicks, which only a published tier-1
        // studio take may voice: a draft take, a take in review or any other
        // tier leaves the click unrecorded as far as a learner is concerned.
        const clickIds = referencedClickIds(decoded.right);
        const recordedClicks =
          clickIds.length === 0
            ? []
            : await db
                .selectDistinct({ targetId: audioAssets.targetId })
                .from(audioAssets)
                .where(
                  and(
                    eq(audioAssets.targetKind, "click"),
                    eq(audioAssets.tier, "1_native_studio"),
                    eq(audioAssets.status, "published"),
                    inArray(audioAssets.targetId, [...clickIds]),
                  ),
                );
        return graphPublishGate({
          ...approval,
          references: refs,
          optionCollisions: await optionCollisionsOf(decoded.right),
          clicksMissingAudio: clicksMissingAudio(
            clickIds,
            new Set(recordedClicks.map((r) => r.targetId)),
          ).map((id) => clickSoundById(id)?.letter ?? id),
        });
      }
      case "lesson": {
        const rows = await db
          .select({ id: exercises.id, status: exercises.status })
          .from(exercises)
          .where(eq(exercises.lessonId, row.id));
        return containerPublishGate({
          ...approval,
          children: rows.map((r) => ({ kind: "exercise", id: r.id, status: r.status })),
        });
      }
      case "skill": {
        const rows = await db
          .select({ id: lessons.id, status: lessons.status })
          .from(lessons)
          .where(eq(lessons.skillId, row.id));
        return containerPublishGate({
          ...approval,
          children: rows.map((r) => ({ kind: "lesson", id: r.id, status: r.status })),
        });
      }
      case "unit": {
        const rows = await db
          .select({ id: skills.id, status: skills.status })
          .from(skills)
          .where(eq(skills.unitId, row.id));
        return containerPublishGate({
          ...approval,
          children: rows.map((r) => ({ kind: "skill", id: r.id, status: r.status })),
        });
      }
      case "grammar_note": {
        // The gate asks whether the note is complete and whether it points at
        // anything a learner may not see. It cannot ask whether the rule is
        // *true* — see docs/GRAMMAR.md section 4 — which is what `caveat` is
        // for and why an editor, not this function, is the last word.
        const bodyRows = await db
          .select({ sourceLang: grammarNoteBodies.sourceLang, status: grammarNoteBodies.status })
          .from(grammarNoteBodies)
          .where(
            and(
              eq(grammarNoteBodies.grammarNoteId, row.id),
              inArray(grammarNoteBodies.status, ["draft", "in_review", "published"]),
            ),
          );
        const cellRows = await db
          .select({
            role: grammarNoteCells.role,
            lexemeId: grammarNoteCells.lexemeId,
            audioAssetId: grammarNoteCells.audioAssetId,
          })
          .from(grammarNoteCells)
          .where(eq(grammarNoteCells.grammarNoteId, row.id));
        const references = [
          ...(await statusesOf(
            "lexeme",
            cellRows.flatMap((c) => (c.lexemeId ? [c.lexemeId] : [])),
          )),
          ...(await statusesOf(
            "audio_asset",
            cellRows.flatMap((c) => (c.audioAssetId ? [c.audioAssetId] : [])),
          )),
        ];
        return grammarNotePublishGate(
          {
            ...approval,
            bodyLanguages: bodyRows.map((b) => b.sourceLang),
            references,
            workedExampleCells: cellRows.filter((c) => c.role === "example").length,
          },
          { sourceLanguages: await sourceLanguages() },
        );
      }
      case "gloss":
      case "sentence_gloss":
      case "grammar_note_body":
      case "audio_asset":
        return graphPublishGate({ ...approval, references: [] });
      case "speaker":
        throw new RepoError("invalid", "speakers have no status");
      case "click":
        throw new RepoError("invalid", "a bare click has no row and no status");
    }
  }

  /**
   * The only function in the codebase that writes `status = 'published'`.
   * Runs `transition()` and persists the outcome plus a revision row in one
   * transaction. Publishing a lexeme also publishes its draft/in_review
   * glosses: the approver has read them, and a learner must never see an
   * unreviewed gloss.
   */
  async function transitionEntity(req: TransitionRequest): Promise<TransitionOutcome> {
    assertEditorial(actor);
    const row = await loadStatusRow(req.kind, req.id);
    const gate = req.to === "published" ? await gateFor(req.kind, row) : undefined;
    const result = transition({
      entity: row,
      to: req.to,
      actor,
      ...(req.note !== undefined ? { note: req.note } : {}),
      ...(gate !== undefined ? { gate } : {}),
    });
    if (!result.ok) {
      const base = { ok: false as const, reason: describeTransitionError(result.error) };
      return gate ? { ...base, gate } : base;
    }
    const { next } = result;
    const t = tableFor[statusKind(req.kind)];
    await db.transaction(async (tx) => {
      await tx
        .update(t)
        .set({
          status: next.status,
          approvedBy: next.approvedBy,
          approvedAt: next.approvedAt,
          updatedAt: next.revision.at,
        })
        .where(eq(t.id, req.id));
      await tx.insert(contentRevisions).values({
        entityKind: req.kind,
        entityId: req.id,
        diff: { status: { from: next.revision.from, to: next.revision.to } },
        actorId: actor.id,
        note: next.revision.note,
      });
      if (req.kind === "lexeme" && next.status === "published") {
        await tx
          .update(glosses)
          .set({
            status: "published",
            approvedBy: actor.id,
            approvedAt: next.revision.at,
            updatedAt: next.revision.at,
          })
          .where(
            and(eq(glosses.lexemeId, req.id), inArray(glosses.status, ["draft", "in_review"])),
          );
      }
      if (req.kind === "sentence" && next.status === "published") {
        await tx
          .update(sentenceGlosses)
          .set({
            status: "published",
            approvedBy: actor.id,
            approvedAt: next.revision.at,
            updatedAt: next.revision.at,
          })
          .where(
            and(
              eq(sentenceGlosses.sentenceId, req.id),
              inArray(sentenceGlosses.status, ["draft", "in_review"]),
            ),
          );
      }
    });
    return { ok: true, status: next.status };
  }

  /**
   * A batch of transitions from the content grid. There is no bulk path
   * through the status machine: this loops over `transitionEntity()`, so
   * every row gets the same edge check, four-eyes rule, note requirement
   * and publish gate it would get on its own. `ai_draft → published` is as
   * impossible here as it is per row. One blocked row never stops the rest;
   * the caller is handed a verdict per id.
   */
  async function transitionMany(req: BulkTransitionRequest): Promise<BulkTransitionOutcome[]> {
    assertEditorial(actor);
    const seen = new Set<string>();
    const out: BulkTransitionOutcome[] = [];
    for (const id of req.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const r = await transitionEntity({
          kind: req.kind,
          id,
          to: req.to,
          ...(req.note !== undefined ? { note: req.note } : {}),
        });
        out.push({ id, ...r });
      } catch (e) {
        // A missing or malformed row blocks that row only.
        out.push({ id, ok: false, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  }

  /** Dry-run the publish gate without changing anything; what the dashboard shows as "what is missing". */
  async function publishCheck(kind: EntityKind, id: string): Promise<GateResult> {
    const row = await loadStatusRow(kind, id);
    return gateFor(kind, row);
  }

  /** Read-only provenance and revision notes for the existing lexeme detail route. */
  async function reviewGlosses(lexemeId: string) {
    assertEditorial(actor);
    const rows = await db.select().from(glosses).where(eq(glosses.lexemeId, lexemeId));
    if (!rows.length) return [];
    const revisions = await db
      .select()
      .from(contentRevisions)
      .where(
        and(
          eq(contentRevisions.entityKind, "gloss"),
          inArray(
            contentRevisions.entityId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .orderBy(desc(contentRevisions.createdAt));
    return rows.map((row) => {
      const history = revisions.filter((r) => r.entityId === row.id);
      // Status is not provenance: an AI draft can already be in review.
      const upsert = history.find((r) => r.diff["upsert"] !== undefined)?.diff["upsert"];
      const value =
        upsert && typeof upsert === "object" && "origin" in upsert ? upsert.origin : undefined;
      const origin: "human" | "llm" | "unknown" =
        value === "human" || value === "llm" ? value : "unknown";
      return { ...row, origin, revisions: history.slice(0, 50) };
    });
  }

  // ---- review-queue assignment ---------------------------------------------

  /**
   * Everything sitting in `in_review`, with its assignment. `mine` and
   * `unassigned` are filters over the same view; the queue itself is never
   * widened beyond `in_review`.
   */
  async function reviewQueue(
    opts: { filter?: ReviewFilter; limit?: number } = {},
  ): Promise<ReviewQueueRow[]> {
    assertEditorial(actor);
    const filter = opts.filter ?? "all";
    // Two aliases of `user`: who holds the item, and who gave it to them.
    const assignee = alias(users, "assignee");
    const assigner = alias(users, "assigner");
    // And a third: who made it, so the queue says "by <display name>", not an id.
    const creator = alias(users, "creator");
    const conds =
      filter === "mine"
        ? [eq(reviewQueueView.assignedTo, actor.id)]
        : filter === "unassigned"
          ? [isNull(reviewQueueView.assignedTo)]
          : [];
    const rows = await db
      .select({
        entityKind: reviewQueueView.entityKind,
        entityId: reviewQueueView.entityId,
        glossLexemeId: glosses.lexemeId,
        label: reviewQueueView.label,
        status: reviewQueueView.status,
        createdBy: reviewQueueView.createdBy,
        updatedAt: reviewQueueView.updatedAt,
        assignedTo: reviewQueueView.assignedTo,
        assignedToName: assignee.name,
        assignedAt: reviewQueueView.assignedAt,
        assignedBy: reviewQueueView.assignedBy,
        assignedByName: assigner.name,
        priority: reviewQueueView.priority,
        notes: reviewQueueView.notes,
        audioTargetKind: audioAssets.targetKind,
        audioTargetId: audioAssets.targetId,
        audioR2Key: audioAssets.r2Key,
        audioTier: audioAssets.tier,
        audioSpeakerName: speakers.displayName,
        createdByName: creator.name,
        exerciseType: exercises.type,
        exercisePayload: exercises.payload,
      })
      .from(reviewQueueView)
      .leftJoin(
        glosses,
        and(eq(reviewQueueView.entityKind, "gloss"), eq(glosses.id, reviewQueueView.entityId)),
      )
      .leftJoin(
        audioAssets,
        and(
          eq(reviewQueueView.entityKind, "audio_asset"),
          eq(audioAssets.id, reviewQueueView.entityId),
        ),
      )
      .leftJoin(speakers, eq(speakers.id, audioAssets.speakerId))
      .leftJoin(
        exercises,
        and(eq(reviewQueueView.entityKind, "exercise"), eq(exercises.id, reviewQueueView.entityId)),
      )
      .leftJoin(assignee, eq(assignee.id, reviewQueueView.assignedTo))
      .leftJoin(assigner, eq(assigner.id, reviewQueueView.assignedBy))
      .leftJoin(creator, eq(creator.id, reviewQueueView.createdBy))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(reviewQueueView.priority), asc(reviewQueueView.updatedAt))
      .limit(Math.min(opts.limit ?? 200, 500));
    // What a recording is of: the word or phrase, so the row can say so.
    const audioLexemeIds = rows.flatMap((r) =>
      r.audioTargetKind === "lexeme" && r.audioTargetId ? [r.audioTargetId] : [],
    );
    const audioSentenceIds = rows.flatMap((r) =>
      r.audioTargetKind === "sentence" && r.audioTargetId ? [r.audioTargetId] : [],
    );
    const [lxTexts, snTexts] = await Promise.all([
      audioLexemeIds.length
        ? db
            .select({ id: lexemes.id, text: lexemes.lemma })
            .from(lexemes)
            .where(inArray(lexemes.id, audioLexemeIds))
        : [],
      audioSentenceIds.length
        ? db
            .select({ id: sentences.id, text: sentences.textXh })
            .from(sentences)
            .where(inArray(sentences.id, audioSentenceIds))
        : [],
    ]);
    const targetText = new Map([...lxTexts, ...snTexts].map((r) => [r.id, r.text]));
    return rows.map(
      ({
        glossLexemeId,
        audioTargetKind,
        audioTargetId,
        audioR2Key,
        audioTier,
        audioSpeakerName,
        exerciseType,
        exercisePayload,
        ...r
      }) => ({
        ...r,
        createdByName: r.createdByName ?? null,
        audio:
          r.entityKind === "audio_asset" && audioTargetKind && audioTargetId && audioR2Key
            ? {
                targetKind: audioTargetKind,
                targetId: audioTargetId,
                targetText:
                  audioTargetKind === "click"
                    ? (clickSoundById(audioTargetId)?.letter ?? null)
                    : (targetText.get(audioTargetId) ?? null),
                tier: audioTier ?? "",
                speakerName: audioSpeakerName ?? null,
                r2Key: audioR2Key,
              }
            : null,
        exercise:
          r.entityKind === "exercise" && exerciseType
            ? { type: exerciseType, title: cultureTitleOf(exercisePayload) }
            : null,
        clickLetter:
          audioTargetKind === "click" && audioTargetId
            ? (clickSoundById(audioTargetId)?.letter ?? null)
            : null,
        lexemeId: r.entityKind === "lexeme" ? r.entityId : glossLexemeId,
        updatedAt: r.updatedAt.toISOString(),
        assignedAt: r.assignedAt ? r.assignedAt.toISOString() : null,
        assignedToName: r.assignedToName ?? null,
        assignedByName: r.assignedByName ?? null,
      }),
    );
  }

  /** The people an item can be handed to: editors and admins, never learners. */
  async function editorialUsers(): Promise<EditorialUser[]> {
    assertEditorial(actor);
    const rows = await db
      .select({ id: users.id, name: users.name, role: userRoles.role })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(inArray(userRoles.role, ["editor", "admin"]))
      .orderBy(asc(users.name));
    const byId = new Map<string, EditorialUser>();
    for (const r of rows) {
      const found = byId.get(r.id);
      if (found) byId.set(r.id, { ...found, roles: [...found.roles, r.role] });
      else byId.set(r.id, { id: r.id, name: r.name, roles: [r.role] });
    }
    return [...byId.values()];
  }

  /**
   * Claims, releases or hands over one review item. An editor may take an
   * unassigned item and give up one they hold; only an admin may move an
   * item off somebody else or onto them. The change is appended to
   * `content_revisions` like every other editorial act, so "who assigned
   * this" is answerable after the fact. Assignment never touches status.
   */
  async function assignReview(req: AssignReviewRequest): Promise<ReviewAssignmentState> {
    assertEditorial(actor);
    const isAdmin = actor.roles.includes("admin");
    if (req.assignedTo !== null && req.assignedTo !== actor.id && !isAdmin) {
      throw new RepoError("forbidden", "only an admin can assign to another editor");
    }
    if (req.assignedTo !== null) {
      const target = await editorialUsers();
      if (!target.some((u) => u.id === req.assignedTo)) {
        throw new RepoError("invalid", `${req.assignedTo} has no editorial role`);
      }
    }
    const [existing] = await db
      .select({ assignedTo: reviewAssignments.assignedTo })
      .from(reviewAssignments)
      .where(
        and(eq(reviewAssignments.entityKind, req.kind), eq(reviewAssignments.entityId, req.id)),
      )
      .limit(1);
    const from = existing?.assignedTo ?? null;
    if (from !== null && from !== actor.id && !isAdmin) {
      throw new RepoError("forbidden", "only an admin can take an item off another editor");
    }
    if (from === req.assignedTo) return { assignedTo: from, assignedAt: null, assignedBy: null };
    const now = new Date();
    const values = {
      entityKind: req.kind,
      entityId: req.id,
      assignedTo: req.assignedTo,
      assignedAt: req.assignedTo === null ? null : now,
      assignedBy: req.assignedTo === null ? null : actor.id,
    };
    await db
      .insert(reviewAssignments)
      .values(values)
      .onConflictDoUpdate({
        target: [reviewAssignments.entityKind, reviewAssignments.entityId],
        set: {
          assignedTo: values.assignedTo,
          assignedAt: values.assignedAt,
          assignedBy: values.assignedBy,
        },
      });
    await revision(req.kind, req.id, { assignedTo: { from, to: req.assignedTo } });
    return {
      assignedTo: req.assignedTo,
      assignedAt: values.assignedAt ? values.assignedAt.toISOString() : null,
      assignedBy: values.assignedBy,
    };
  }

  return {
    createLexeme,
    updateLexeme,
    updateUnit,
    updateSkill,
    updateLesson,
    updateExercise,
    moveExercise,
    moveGrammarNote,
    deleteDraft,
    curriculumTree,
    upsertGloss,
    addLink,
    createSentence,
    updateSentence,
    setSentenceTokens,
    upsertSentenceGloss,
    createAudioAsset,
    createUnit,
    createSkill,
    createGrammarNote,
    findGrammarNote,
    updateGrammarNote,
    upsertGrammarNoteBody,
    setGrammarNoteCells,
    grammarNoteTree,
    createLesson,
    createExercise,
    transitionEntity,
    transitionMany,
    publishCheck,
    reviewQueue,
    reviewGlosses,
    editorialUsers,
    assignReview,
    addNote,
    recentNotes,
    discardAudio,
  };
}

export type EditorRepo = ReturnType<typeof editorRepo>;
