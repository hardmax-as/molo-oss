/**
 * The weekly content report (docs/ARCHITECTURE.md section 4). Two halves,
 * deliberately split: `packages/db` gathers the numbers (`contentReport`),
 * this module turns them into text. The formatter is pure, so the CLI
 * (`molo content report`) and the Worker cron post the same words and the
 * Worker bundle never pulls in an ingest adapter or a Node built-in.
 *
 * The same figures back the editor dashboard's landing page
 * (docs/ARCHITECTURE.md section 7): one query layer, three readers, so the
 * number in Slack on Monday and the number on the screen on Tuesday can
 * never disagree.
 *
 * Nothing here may carry a user identity or a secret: the report is counts
 * only, and it goes to a Slack channel.
 */

import type { GateFailureCode } from "./publish-gate.ts";

/** Rows of one content table grouped by `status`. A missing key means zero. */
export type StatusCounts = Readonly<Record<string, number>>;

/**
 * The statuses the landing page calls *pending*: a row an editor is trying
 * to move forward. `published` is done and `retired` is abandoned, so
 * neither is work.
 */
export const PENDING_STATUSES = ["draft", "ai_draft", "in_review"] as const;

/** One skill whose lessons hold no sentence at all: something to write. */
export interface SkillSentenceGap {
  readonly skillId: string;
  readonly skillSlug: string;
  readonly skillTitleKey: string;
  readonly unitSlug: string;
  readonly unitTitleKey: string;
  /** Lessons in the skill, so an editor can see how much writing it is. */
  readonly lessons: number;
}

/** Words a unit teaches that still have no native recording. */
export interface UnitRecordingGap {
  readonly unitSlug: string;
  readonly unitTitleKey: string;
  readonly missing: number;
}

/**
 * The writing side of the queue: content that does not exist yet, as
 * opposed to content that exists and is blocked. Every figure names rows an
 * editor can open.
 */
export interface WritingGaps {
  /** Skills with lessons but no sentence anywhere in them, in curriculum order. */
  readonly skillsWithoutSentences: readonly SkillSentenceGap[];
  /** How many such skills there are; the list above is capped for the page. */
  readonly skillsWithoutSentencesTotal: number;
  /** Pending lexemes with an `en` gloss and no `nb` one. */
  readonly lexemesMissingNbGloss: number;
  /** Pending lexemes with an `nb` gloss and no `en` one. */
  readonly lexemesMissingEnGloss: number;
  /** Pending lexemes with neither gloss. */
  readonly lexemesMissingBothGlosses: number;
  /** Exercises that name a lexeme or sentence which is not published yet. */
  readonly exercisesReferencingUnpublished: number;
  /** Pending sentences short of a translation in at least one source language. */
  readonly sentencesMissingTranslation: number;
}

/**
 * The recording side: what a studio session could be planned around. A
 * "publish-eligible" word is one that is not retired and not already
 * published — the words a recording would actually unblock.
 */
export interface RecordingGaps {
  /** Per unit, so a session can be one unit at a time. Most missing first. */
  readonly byUnit: readonly UnitRecordingGap[];
  /** Words with no recording that no unit teaches yet. */
  readonly notInAnyUnit: number;
  /** Takes recorded or ingested and waiting for a second editor to approve. */
  readonly takesAwaitingApproval: number;
  /** Speakers with a consent record on file. A session cannot start without one. */
  readonly speakersWithConsent: number;
  readonly speakersTotal: number;
}

/**
 * One publish-gate refusal, counted across pending content. `rows` is the
 * number of *rows* the gate would refuse for this reason, not the number of
 * failures it would emit: a sentence with four unverified tokens is one row
 * an editor has to open, which is the number worth showing.
 *
 * Only the codes that are facts about the content are counted.
 * `four_eyes` and `approver_not_editorial` depend on who is approving, not
 * on the row, so they are never in this list.
 */
export interface GateBlockerCount {
  readonly kind: "lexeme" | "sentence";
  readonly code: GateFailureCode;
  /** The source language for `gloss_missing`; null for every other code. */
  readonly detail: string | null;
  readonly rows: number;
}

export interface ContentReport {
  /** The day the report was gathered, YYYY-MM-DD (UTC). */
  readonly date: string;
  /** How far back the learner numbers look. */
  readonly windowDays: number;
  readonly lexemes: StatusCounts;
  readonly sentences: StatusCounts;
  readonly exercises: StatusCounts;
  readonly units: StatusCounts;
  /** Published glosses by source language, e.g. `{ en: 40, nb: 12 }`. */
  readonly glossesPublished: StatusCounts;
  readonly audio: {
    /** Published assets that satisfy the publish gate. */
    readonly tier1: number;
    readonly tier2: number;
    /** TTS: may exist on a row, never satisfies the gate. */
    readonly tier3: number;
    /** Recorded or ingested but not published yet: the studio's queue. */
    readonly pending: number;
    readonly inReview: number;
  };
  /** What stands between today's content and more published rows. */
  readonly blockers: {
    readonly reviewQueue: number;
    readonly publishedLexemesWithoutTier12Audio: number;
    readonly inReviewLexemesWithoutTier12Audio: number;
    readonly lexemesInUnvalidatedClass: number;
    readonly unvalidatedNounClasses: number;
    /**
     * Every publish-gate refusal the pending content would earn, counted by
     * reason: "34 words need a recording, 12 need a Norwegian gloss". The
     * same verdict `transitionEntity` gives one row at a time, in one query.
     */
    readonly gate: readonly GateBlockerCount[];
    /** How many rows of each kind the gate figures were computed over. */
    readonly gateConsidered: { readonly lexemes: number; readonly sentences: number };
  };
  /** Content that does not exist yet, named so an editor can go and write it. */
  readonly writing: WritingGaps;
  /** What a recording session would clear, per unit. */
  readonly recording: RecordingGaps;
  /** Counts only; never a name, an email or an id. */
  readonly learners: {
    readonly active: number;
    readonly lessonsCompleted: number;
    readonly signups: number;
    readonly plus: number;
  };
}

export function totalOf(counts: StatusCounts): number {
  let n = 0;
  for (const v of Object.values(counts)) n += v;
  return n;
}

const at = (counts: StatusCounts, key: string): number => counts[key] ?? 0;

const pct = (a: number, b: number): string => (b === 0 ? "0%" : `${Math.round((a / b) * 100)}%`);

/**
 * One Slack message an editor can act on. mrkdwn, because that is what an
 * incoming webhook renders; it reads the same as plain text in a log line.
 */
export function formatContentReport(r: ContentReport): string {
  const lexTotal = totalOf(r.lexemes);
  const published = at(r.lexemes, "published");
  const drafts = at(r.lexemes, "draft") + at(r.lexemes, "ai_draft");
  const tier12 = r.audio.tier1 + r.audio.tier2;
  const glosses = Object.entries(r.glossesPublished)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lang, n]) => `${lang} ${n}`)
    .join(", ");
  const b = r.blockers;
  return [
    `*Molo content report* (${r.date})`,
    `• Lexemes: ${published} published of ${lexTotal} (${pct(published, lexTotal)}), ${at(r.lexemes, "in_review")} in review, ${drafts} drafts`,
    `• Published glosses: ${glosses === "" ? "none" : glosses}`,
    `• Sentences: ${at(r.sentences, "published")} published of ${totalOf(r.sentences)}; exercises: ${at(r.exercises, "published")} published of ${totalOf(r.exercises)}; units published: ${at(r.units, "published")}`,
    `• Audio: ${tier12} tier-1/2 assets published (tier 3 never counts); ${r.audio.pending} unpublished, ${r.audio.inReview} of them in review`,
    `• Publish blockers: ${b.publishedLexemesWithoutTier12Audio} published and ${b.inReviewLexemesWithoutTier12Audio} in-review lexemes without tier-1/2 audio; ${b.lexemesInUnvalidatedClass} lexemes in an unvalidated noun class (${b.unvalidatedNounClasses} classes unvalidated)`,
    `• Review queue: ${b.reviewQueue} items waiting for a second editor`,
    `• Learners (${r.windowDays}d): ${r.learners.active} active, ${r.learners.lessonsCompleted} lessons completed, ${r.learners.signups} new sign-ups; ${r.learners.plus} on Plus`,
  ].join("\n");
}
