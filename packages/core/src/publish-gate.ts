/**
 * Publish gates (ARCHITECTURE section 2.5). Pure functions over plain
 * inputs; the caller gathers the facts (glosses, audio rows, morph
 * verdicts) and hands them in. The verdict feeds `transition()`.
 */

import type { AudioTier } from "./audio.ts";
import { isPublishableTier } from "./audio.ts";
import type { Actor, Status } from "./status.ts";
import { isEditorial } from "./status.ts";

export type GateFailureCode =
  | "pos_missing"
  | "noun_class_missing"
  | "plural_not_generable"
  | "no_morphology_generator"
  | "gloss_missing"
  | "audio_missing"
  | "licence_missing"
  | "source_missing"
  | "approver_not_editorial"
  | "four_eyes"
  | "lexeme_not_published"
  | "surface_form_unverified"
  | "referenced_entity_not_published"
  | "body_missing"
  | "worked_example_missing"
  | "option_labels_collide"
  | "click_audio_missing"
  | "no_published_children";

export interface GateFailure {
  readonly code: GateFailureCode;
  readonly detail?: string;
}

export interface GateResult {
  readonly ok: boolean;
  readonly failures: readonly GateFailure[];
}

export interface GateContext {
  /** Every `languages.is_source` code; a gloss is required for each. */
  readonly sourceLanguages: readonly string[];
}

/**
 * The morphology facts a gate needs. `generator` is the name of the
 * generator the row's target language uses (`xh-morph` for isiXhosa) or
 * `null` when the language has none — in which case nothing that depends on
 * generated forms can publish, because there is no correct-by-construction
 * answer to compare against. See `morphGeneratorFor` in `courses.ts`.
 */
interface MorphologyFacts {
  readonly morphGenerator: string | null;
}

interface ApprovalFacts {
  readonly createdBy: string | null;
  readonly approver: Actor;
}

function approvalFailures(f: ApprovalFacts): GateFailure[] {
  const out: GateFailure[] = [];
  if (!isEditorial(f.approver)) out.push({ code: "approver_not_editorial" });
  // An admin may approve their own work (status.ts, ADMIN_SELF_APPROVAL_NOTE).
  if (f.createdBy !== null && f.createdBy === f.approver.id && !f.approver.roles.includes("admin"))
    out.push({ code: "four_eyes" });
  return out;
}

function verdict(failures: GateFailure[]): GateResult {
  return { ok: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// Lexeme
// ---------------------------------------------------------------------------

export interface LexemeGateInput extends ApprovalFacts, MorphologyFacts {
  readonly pos: string | null;
  readonly nounClass: string | null;
  /** True when a `plural_of` link exists in either direction. */
  readonly hasPluralLink: boolean;
  /** `xh-morph`'s answer for this lemma + class; `null` when not asked (non-noun). */
  readonly canGeneratePlural: boolean | null;
  /** Source languages that have a gloss row for this lexeme. */
  readonly glossLanguages: readonly string[];
  /** Every audio asset targeting this lexeme. */
  readonly audio: ReadonlyArray<{ readonly tier: AudioTier; readonly status: Status }>;
  readonly licence: string | null;
  readonly source: string | null;
}

export function lexemePublishGate(input: LexemeGateInput, ctx: GateContext): GateResult {
  const failures: GateFailure[] = [];

  if (!input.pos) failures.push({ code: "pos_missing" });
  if (input.pos === "noun") {
    if (!input.nounClass) failures.push({ code: "noun_class_missing" });
    else if (!input.hasPluralLink) {
      // A noun's plural is a morphology question. Without a generator for
      // this language there is nothing that can answer it, so an editor has
      // to state the plural as a link instead.
      if (input.morphGenerator === null) {
        failures.push({
          code: "no_morphology_generator",
          detail: "this course's language has no morphology generator; set a plural_of link",
        });
      } else if (input.canGeneratePlural !== true) {
        failures.push({
          code: "plural_not_generable",
          detail: `${input.morphGenerator} cannot generate the plural and no plural_of link is set`,
        });
      }
    }
  }
  for (const lang of ctx.sourceLanguages) {
    if (!input.glossLanguages.includes(lang))
      failures.push({ code: "gloss_missing", detail: lang });
  }
  const hasPublishableAudio = input.audio.some(
    (a) => a.status === "published" && isPublishableTier(a.tier),
  );
  if (!hasPublishableAudio) {
    failures.push({ code: "audio_missing", detail: "no published tier-1 or tier-2 audio" });
  }
  if (!input.licence) failures.push({ code: "licence_missing" });
  if (!input.source) failures.push({ code: "source_missing" });
  failures.push(...approvalFailures(input));

  return verdict(failures);
}

// ---------------------------------------------------------------------------
// Sentence
// ---------------------------------------------------------------------------

export interface SentenceGateInput extends ApprovalFacts, MorphologyFacts {
  readonly glossLanguages: readonly string[];
  readonly audio: ReadonlyArray<{ readonly tier: AudioTier; readonly status: Status }>;
  readonly licence: string | null;
  readonly source: string | null;
  readonly lexemes: ReadonlyArray<{
    readonly lexemeId: string;
    readonly status: Status;
    readonly surfaceForm: {
      /** `xh-morph` reproduced this form. */
      readonly morphVerified: boolean;
      /** An editor marked it irregular... */
      readonly irregular: boolean;
      /** ...and said why. */
      readonly note: string | null;
    };
  }>;
}

export function sentencePublishGate(input: SentenceGateInput, ctx: GateContext): GateResult {
  const failures: GateFailure[] = [];

  for (const lang of ctx.sourceLanguages) {
    if (!input.glossLanguages.includes(lang))
      failures.push({ code: "gloss_missing", detail: lang });
  }
  if (!input.audio.some((a) => a.status === "published" && isPublishableTier(a.tier))) {
    failures.push({ code: "audio_missing" });
  }
  if (!input.licence) failures.push({ code: "licence_missing" });
  if (!input.source) failures.push({ code: "source_missing" });
  let needsGenerator = false;
  for (const l of input.lexemes) {
    if (l.status !== "published") {
      failures.push({ code: "lexeme_not_published", detail: l.lexemeId });
    }
    const sf = l.surfaceForm;
    const irregularWithNote = sf.irregular && sf.note !== null && sf.note.trim() !== "";
    if (!sf.morphVerified && !irregularWithNote) {
      failures.push({ code: "surface_form_unverified", detail: l.lexemeId });
      needsGenerator = true;
    }
  }
  // Without a generator no token can ever become `morphVerified`, so say so
  // once instead of leaving the editor to wonder why the form never clears.
  if (needsGenerator && input.morphGenerator === null) {
    failures.push({
      code: "no_morphology_generator",
      detail: "this course's language has no morphology generator; mark each form irregular",
    });
  }
  failures.push(...approvalFailures(input));

  return verdict(failures);
}

// ---------------------------------------------------------------------------
// Grammar note (docs/GRAMMAR.md)
// ---------------------------------------------------------------------------

export interface GrammarNoteGateInput extends ApprovalFacts {
  /** Source languages that have a body a human owns: draft, in_review or published. */
  readonly bodyLanguages: readonly string[];
  /**
   * Every lexeme and audio asset the note's cells point at. A note that
   * shows a word a learner may not see yet is a leak like any other.
   */
  readonly references: readonly ReferencedEntity[];
  /**
   * Cells marked `example`. GRAMMAR.md asks for a worked example *before*
   * the rule, so a note that is only prose does not publish: the learner
   * would meet an assertion with nothing to hear it in.
   */
  readonly workedExampleCells: number;
}

/**
 * A grammar note publishes when it says the same thing in every source
 * language, shows at least one worked example, and points at nothing a
 * learner may not already see.
 *
 * What this gate deliberately does *not* check is whether the rule is
 * **true**. It cannot: GRAMMAR.md section 4 is explicit that the
 * finite-state guarantee covers the form a generator produces, not the rule
 * behind it. That is the editor's job, and it is why every note carries a
 * caveat naming what the reviewer is being asked to validate.
 */
export function grammarNotePublishGate(input: GrammarNoteGateInput, ctx: GateContext): GateResult {
  const failures: GateFailure[] = [];
  for (const lang of ctx.sourceLanguages) {
    if (!input.bodyLanguages.includes(lang)) failures.push({ code: "body_missing", detail: lang });
  }
  if (input.workedExampleCells === 0) failures.push({ code: "worked_example_missing" });
  for (const r of input.references) {
    if (r.status !== "published") {
      failures.push({ code: "referenced_entity_not_published", detail: `${r.kind}:${r.id}` });
    }
  }
  failures.push(...approvalFailures(input));
  return verdict(failures);
}

// ---------------------------------------------------------------------------
// Exercise, lesson, skill, unit: the graph walk
// ---------------------------------------------------------------------------

export interface ReferencedEntity {
  readonly kind: "lexeme" | "sentence" | "audio_asset" | "exercise" | "lesson" | "skill";
  readonly id: string;
  readonly status: Status;
}

export interface GraphGateInput extends ApprovalFacts {
  readonly references: readonly ReferencedEntity[];
  /**
   * Exercises only: labels two or more option tiles share (`optionCollisions`
   * in exercises/option-labels.ts). One failure each, detail `<field>:<label>`.
   */
  readonly optionCollisions?: readonly { readonly field: string; readonly label: string }[];
  /**
   * `click_identify` only: the clicks (letters) with no published tier-1
   * studio recording (`clicksMissingAudio` in click-sounds.ts). One failure
   * each, detail the letter. Tier 2 and 3 never count: nobody else records
   * a bare click, and a synthetic one would teach the wrong sound.
   */
  readonly clicksMissingAudio?: readonly string[];
}

/**
 * An exercise (or lesson, skill, unit) may publish only when everything it
 * references is already published. The caller walks the graph and lists
 * every referenced entity with its current status.
 */
export function graphPublishGate(input: GraphGateInput): GateResult {
  const failures: GateFailure[] = [];
  for (const r of input.references) {
    if (r.status !== "published") {
      failures.push({ code: "referenced_entity_not_published", detail: `${r.kind}:${r.id}` });
    }
  }
  for (const c of input.optionCollisions ?? []) {
    failures.push({ code: "option_labels_collide", detail: `${c.field}:${c.label}` });
  }
  for (const letter of input.clicksMissingAudio ?? []) {
    failures.push({ code: "click_audio_missing", detail: letter });
  }
  failures.push(...approvalFailures(input));
  return verdict(failures);
}

/**
 * A lesson, skill or unit: a container learners only ever see through its
 * published children. It may publish when every child that was sent on is
 * published and at least one is. A child still in `draft` or `ai_draft` does
 * not hold it back, and stays invisible until it is approved in its own
 * right; a child `in_review` does, since it is about to be decided; a retired
 * child never counts. The operator's rule of 2026-09-27, so a unit can go out
 * with the skills that are ready and grow as the rest is approved.
 */
export function containerPublishGate(input: {
  readonly children: readonly ReferencedEntity[];
  readonly createdBy: string | null;
  readonly approver: Actor;
}): GateResult {
  const failures: GateFailure[] = [];
  const counted = input.children.filter(
    (c) => c.status !== "draft" && c.status !== "ai_draft" && c.status !== "retired",
  );
  for (const c of counted) {
    if (c.status !== "published")
      failures.push({ code: "referenced_entity_not_published", detail: `${c.kind}:${c.id}` });
  }
  if (!counted.some((c) => c.status === "published"))
    failures.push({ code: "no_published_children" });
  failures.push(...approvalFailures(input));
  return verdict(failures);
}
