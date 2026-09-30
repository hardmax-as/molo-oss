/**
 * What a lesson earned, as an ordered list of celebration beats
 * (docs/DESIGN.md "After a lesson"). Both clients run this function so the
 * web and mobile sequences agree on which beats a result deserves and in
 * which order they play.
 *
 * Deliberately free of Effect and of every other import: the mobile Jest
 * suite imports it directly as `@molo/core/celebration`, and the API
 * schema for the server's facts lives in `api.ts` where the rest of the
 * boundary lives. `CelebrationFacts` below is the structural shape of that
 * schema's decoded value.
 */

/** Words-learned thresholds that earn a milestone beat. Ascending. */
export const WORD_MILESTONES = [25, 50, 100, 250, 500] as const;

export interface LessonBeat {
  readonly kind: "lesson";
  readonly xp: number;
  readonly correct: number;
  readonly total: number;
  /** Every answer right: a different pose, a different chime, a bigger burst. */
  readonly perfect: boolean;
  /** 0–100, rounded; 0 for an empty lesson. */
  readonly accuracy: number;
}

export interface StreakBeat {
  readonly kind: "streak";
  readonly days: number;
  /** A freeze covered a missed day, so the beat says "saved", not "extended". */
  readonly frozen: boolean;
  /** Monday first: the days of this week the learner has been active. */
  readonly week: readonly boolean[];
  /** Index of today in `week`; 0 is Monday. */
  readonly todayIndex: number;
}

export interface MilestoneBeat {
  readonly kind: "milestone";
  /** The round number the learner crossed with this lesson. */
  readonly threshold: number;
  /** Words learned after this lesson, which is at least `threshold`. */
  readonly words: number;
}

export interface UnitBeat {
  readonly kind: "unit";
  readonly slug: string;
  /** i18n key for the unit's title; the clients translate it. */
  readonly titleKey: string;
  /** Every lesson of the unit finished without a wrong answer: the higher tier. */
  readonly flawless: boolean;
}

export type CelebrationBeat = LessonBeat | StreakBeat | MilestoneBeat | UnitBeat;
export type CelebrationBeatKind = CelebrationBeat["kind"];

/** The order beats always play in, whichever ones were earned. */
export const BEAT_ORDER: readonly CelebrationBeatKind[] = ["lesson", "streak", "milestone", "unit"];

export interface CelebrationInput {
  readonly xp: number;
  readonly correct: number;
  readonly total: number;
  /**
   * Only present when this lesson moved the streak on. A guest has no
   * server streak, so this stays absent for them and the beat never shows.
   */
  readonly streak?:
    | {
        readonly days: number;
        /** False when the learner had already been active today: no beat. */
        readonly extended: boolean;
        readonly frozen: boolean;
        readonly week: readonly boolean[];
        readonly todayIndex: number;
      }
    | null
    | undefined;
  /** Words the learner has met, before and after this lesson. Absent for a guest. */
  readonly words?: { readonly learned: number; readonly before: number } | null | undefined;
  /** The unit this lesson belongs to, when the lesson finished it. */
  readonly unit?:
    | {
        readonly slug: string;
        readonly titleKey: string;
        readonly completed: boolean;
        readonly flawless: boolean;
      }
    | null
    | undefined;
}

/** Everything but the lesson's own numbers: what the server (or the guest store) adds. */
export type CelebrationExtras = Omit<CelebrationInput, "xp" | "correct" | "total">;

/**
 * The server's post-lesson facts, structurally identical to the decoded
 * `LessonCelebration` schema in `api.ts`.
 */
export interface CelebrationFacts {
  readonly streakExtended: boolean;
  readonly streakDays: number;
  readonly streakFrozen: boolean;
  readonly streakWeek: readonly boolean[];
  readonly streakTodayIndex: number;
  readonly wordsLearned: number;
  readonly wordsLearnedBefore: number;
  readonly unitCompleted: {
    readonly slug: string;
    readonly titleKey: string;
    readonly flawless: boolean;
  } | null;
}

/**
 * The biggest threshold crossed between `before` and `after`, or `null`.
 * Crossing several at once (a very long lesson) celebrates the biggest one
 * rather than queueing four medals.
 */
export function crossedWordMilestone(
  before: number,
  after: number,
  milestones: readonly number[] = WORD_MILESTONES,
): number | null {
  if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) return null;
  let crossed: number | null = null;
  for (const threshold of milestones) {
    if (threshold > before && threshold <= after) crossed = threshold;
  }
  return crossed;
}

export function accuracyOf(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, Math.min(correct, total)) / total) * 100);
}

/**
 * The beats this result earned, in order. Beats the learner has not earned
 * are absent — never a disabled or empty card. The lesson beat is always
 * first and always present, so the sequence is never empty.
 */
export function celebrationBeats(
  input: CelebrationInput,
  /**
   * Which word counts earn a medal. A parameter only so the developer
   * gallery's knobs panel can move them; the app passes nothing.
   */
  opts: { readonly milestones?: readonly number[] } = {},
): CelebrationBeat[] {
  const total = Math.max(0, Math.floor(input.total));
  const correct = Math.max(0, Math.min(Math.floor(input.correct), total));
  const beats: CelebrationBeat[] = [
    {
      kind: "lesson",
      xp: Math.max(0, Math.floor(input.xp)),
      correct,
      total,
      perfect: total > 0 && correct === total,
      accuracy: accuracyOf(correct, total),
    },
  ];
  const streak = input.streak;
  if (streak && streak.extended && streak.days > 0) {
    beats.push({
      kind: "streak",
      days: streak.days,
      frozen: streak.frozen,
      week: streak.week,
      todayIndex: streak.todayIndex,
    });
  }
  const words = input.words;
  if (words) {
    const threshold = crossedWordMilestone(words.before, words.learned, opts.milestones);
    if (threshold !== null) beats.push({ kind: "milestone", threshold, words: words.learned });
  }
  const unit = input.unit;
  if (unit && unit.completed) {
    beats.push({
      kind: "unit",
      slug: unit.slug,
      titleKey: unit.titleKey,
      flawless: unit.flawless,
    });
  }
  return beats;
}

/** Maps the server's post-lesson facts onto the beat inputs. */
export function celebrationExtras(facts: CelebrationFacts): CelebrationExtras {
  return {
    streak: {
      days: facts.streakDays,
      extended: facts.streakExtended,
      frozen: facts.streakFrozen,
      week: facts.streakWeek,
      todayIndex: facts.streakTodayIndex,
    },
    words: { learned: facts.wordsLearned, before: facts.wordsLearnedBefore },
    unit: facts.unitCompleted
      ? {
          slug: facts.unitCompleted.slug,
          titleKey: facts.unitCompleted.titleKey,
          completed: true,
          flawless: facts.unitCompleted.flawless,
        }
      : null,
  };
}

/**
 * A guest's beats. They have no account, so no streak and no words-learned
 * figure exist for them and neither beat is ever shown; a unit they
 * finished on the device is theirs to celebrate all the same.
 */
export function guestCelebrationExtras(input: {
  readonly unit: { readonly slug: string; readonly titleKey: string; readonly lessonCount: number };
  /** Every lesson of that unit in the guest's local tally, this one included. */
  readonly lessons: readonly { readonly correct: number; readonly total: number }[];
  /**
   * False when the learner had already finished this lesson: replaying it
   * crowns nothing, exactly as the server refuses to crown a replay.
   */
  readonly firstTime?: boolean | undefined;
}): CelebrationExtras {
  const { unit, lessons } = input;
  const completed =
    input.firstTime !== false && unit.lessonCount > 0 && lessons.length >= unit.lessonCount;
  return {
    streak: null,
    words: null,
    unit: {
      slug: unit.slug,
      titleKey: unit.titleKey,
      completed,
      flawless: completed && lessons.every((l) => l.total > 0 && l.correct === l.total),
    },
  };
}
