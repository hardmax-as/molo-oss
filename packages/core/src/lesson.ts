/**
 * What the inside of a lesson says about itself: which moment an exercise
 * is (a word never met, a word missed before), how long the learner's
 * current run of right answers is, where a new word is met before it is
 * practised, what the header's hearts say, and when leaving asks first.
 *
 * Both clients read these rules rather than inventing their own, so a
 * "7 in a row" on the phone means exactly what it means in the browser.
 * Nothing here does I/O and nothing here holds copy: the words live in
 * `packages/i18n`, the colours in `docs/DESIGN.md`.
 *
 * Deliberately free of runtime imports (the payload type is erased), so the
 * mobile app's Jest suite can reach it through `@molo/core/lesson` without
 * dragging Effect through a React Native transform. The Effect Schema for
 * `ExerciseMoment` lives with the other boundary schemas in `api.ts`.
 */

import type { ExercisePayload } from "./exercises/index.ts";

// ---------------------------------------------------------------------------
// The run of right answers
// ---------------------------------------------------------------------------

/**
 * Below this a run is not worth saying. Two right answers in a row is not
 * an achievement, and a counter that congratulates everything congratulates
 * nothing.
 */
export const RUN_MIN_TO_SHOW = 3;

/** From here the run reads as hot, and the progress strip takes the warmer colour. */
export const RUN_HOT_AT = 7;

/** How loudly the strip should carry the run. `none` means say nothing at all. */
export const RUN_HEATS = ["none", "warm", "hot"] as const;
export type RunHeat = (typeof RUN_HEATS)[number];

/** The run after one answer: right extends it, wrong ends it. */
export function nextRun(current: number, correct: boolean): number {
  return correct ? Math.max(0, current) + 1 : 0;
}

/**
 * The two thresholds as one value, so the developer gallery's knobs panel
 * can hand a different pair in and see what the strip does. Every caller in
 * the app passes nothing and gets the constants above.
 */
export interface RunRules {
  readonly minToShow: number;
  readonly hotAt: number;
}

export const RUN_RULES: RunRules = { minToShow: RUN_MIN_TO_SHOW, hotAt: RUN_HOT_AT };

export function runHeat(count: number, rules: RunRules = RUN_RULES): RunHeat {
  if (count >= rules.hotAt) return "hot";
  if (count >= rules.minToShow) return "warm";
  return "none";
}

/** True once the run has earned a place on the screen. */
export function runIsWorthSaying(count: number, rules: RunRules = RUN_RULES): boolean {
  return runHeat(count, rules) !== "none";
}

// ---------------------------------------------------------------------------
// What kind of moment this exercise is
// ---------------------------------------------------------------------------

/**
 * `new_word` — the exercise introduces a lexeme this learner has not met.
 * `tricky` — it is built on a word they have got wrong before.
 *
 * A word can be both; `tricky` wins, because "you missed this one" is the
 * more useful thing to say and the badge is one badge.
 */
export const EXERCISE_MOMENTS = ["new_word", "tricky"] as const;
export type ExerciseMoment = (typeof EXERCISE_MOMENTS)[number];

/**
 * The lexemes an exercise *teaches*, as opposed to the ones it merely uses
 * as distractors. Sentence-based types report nothing here: their words
 * come from the sentence's tokens, which only the repository can see, and
 * the caller unions the two.
 */
export function taughtLexemeIds(p: ExercisePayload): readonly string[] {
  switch (p.type) {
    case "listen_select":
    case "select_listen":
      return [p.prompt.lexemeId];
    case "concord_fill":
      return p.blanks.map((b) => b.lexemeId);
    case "class_sort":
      return p.items.map((i) => i.lexemeId);
    case "match_pairs":
      return p.pairs.map((x) => x.lexemeId);
    case "culture_card":
      return [...p.lexemeIds];
    case "click_drill":
      return [
        ...p.pairs.flatMap((pair) => [pair.a.lexemeId, pair.b.lexemeId]),
        ...p.contrastWords.map((w) => w.lexemeId),
      ];
    case "speak":
      return "lexemeId" in p.prompt ? [p.prompt.lexemeId] : [];
    // A bare click is a sound, not a word: it teaches no lexeme.
    case "click_identify":
      return [];
    // The sentence's own tokens are the words; the caller adds them.
    case "translate_tap":
    case "translate_type":
      return [];
  }
}

/**
 * The badge for one exercise, or null for the ordinary case. `tricky` is
 * checked first on purpose (see `EXERCISE_MOMENTS`). A learner with no
 * history sees `new_word` on their first exercises, which is true.
 */
export function momentFor(input: {
  readonly teaches: readonly string[];
  /** Lexemes this learner has already met in a finished lesson. */
  readonly seen: ReadonlySet<string>;
  /** Lexemes on this learner's open-mistake list. */
  readonly tricky: ReadonlySet<string>;
}): ExerciseMoment | null {
  for (const id of input.teaches) if (input.tricky.has(id)) return "tricky";
  for (const id of input.teaches) if (!input.seen.has(id)) return "new_word";
  return null;
}

// ---------------------------------------------------------------------------
// Meeting a word before practising it
// ---------------------------------------------------------------------------

/**
 * The lexemes among `taught` that are not in `seen`, once each, in the order
 * they are first taught. `seen` is the same history `momentFor` reads: the
 * words of every lesson this learner has finished. The server answers this
 * for a signed-in learner (`UnitResponse.unseenLexemeIds`); a guest's device
 * answers it from the lessons it keeps.
 */
export function unseenAmong(taught: Iterable<string>, seen: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const added = new Set<string>();
  for (const id of taught) {
    if (seen.has(id) || added.has(id)) continue;
    added.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Which words are new to this learner, as the lesson screen hands them to
 * the runner. A guest (`guestSeen` given) answers from the device; a
 * signed-in learner from the server's list. A server that predates the list
 * says nothing, and nothing is then introduced: a card that is not there is
 * better than one that introduces a word the learner already knows.
 */
export function newWordsFor(input: {
  /** Every lexeme the lesson teaches. */
  readonly taught: readonly string[];
  /** `UnitResponse.unseenLexemeIds`; absent for a guest and from an older server. */
  readonly serverUnseen?: readonly string[] | null | undefined;
  /** The guest's own history, or null for a signed-in learner. */
  readonly guestSeen: ReadonlySet<string> | null;
}): ReadonlySet<string> {
  if (input.guestSeen) return new Set(unseenAmong(input.taught, input.guestSeen));
  return new Set(input.serverUnseen ?? []);
}

/**
 * Exercises that never get a new-word card in front of them. A click drill
 * and a click identification are about sounds, not meanings, so a card
 * about the word's meaning would be beside the point; a culture card
 * presents its own words in its text.
 */
const NO_CARD_BEFORE: ReadonlySet<string> = new Set([
  "click_identify",
  "click_drill",
  "culture_card",
]);

/**
 * Exercises that introduce their words themselves: once one has been read,
 * its words are met for the rest of the lesson. A click drill is not one of
 * them: the learner heard the word but never saw what it means.
 */
const PRESENTS_ITS_WORDS: ReadonlySet<string> = new Set(["culture_card"]);

/** As much of an exercise as the placement needs. */
export interface IntroducibleExercise {
  readonly id: string;
  readonly type: string;
  /** The lexemes the exercise teaches (`ExerciseView.teaches`). */
  readonly teaches?: readonly string[] | undefined;
}

/**
 * Where the new-word cards go in a lesson: exercise id → the words to meet
 * on a card just before it, in the order the exercise teaches them.
 *
 * Every new word is met once, before the first exercise that asks for its
 * meaning, and never again in the same lesson. Several new words in one
 * exercise (a match_pairs of three) share one card. An exercise with nothing
 * new is absent from the map.
 *
 * `exercises` must be the lesson as it will actually run, after the
 * listening and speaking modes have dropped what they drop, so that a word
 * whose first exercise was dropped is met before the next one instead.
 * `canShow` is whether the unit payload has the word at all: a card is only
 * ever built from published data already on hand, never composed.
 *
 * The cards are not exercises and not database rows: unscored, no hearts,
 * no XP, and not counted by the progress bar.
 */
export function newWordIntroductions(input: {
  readonly exercises: readonly IntroducibleExercise[];
  readonly isNew: (lexemeId: string) => boolean;
  readonly canShow: (lexemeId: string) => boolean;
}): ReadonlyMap<string, readonly string[]> {
  const plan = new Map<string, readonly string[]>();
  const met = new Set<string>();
  for (const e of input.exercises) {
    const teaches = e.teaches ?? [];
    if (PRESENTS_ITS_WORDS.has(e.type)) {
      for (const id of teaches) met.add(id);
      continue;
    }
    if (NO_CARD_BEFORE.has(e.type)) continue;
    const fresh: string[] = [];
    for (const id of teaches) {
      if (met.has(id)) continue;
      met.add(id);
      if (input.isNew(id) && input.canShow(id)) fresh.push(id);
    }
    if (fresh.length > 0) plan.set(e.id, fresh);
  }
  return plan;
}

/**
 * The words still to meet before `exerciseId`, given the ones this lesson
 * has already introduced. Kept apart from the placement so the runner can
 * recompute the plan whenever its inputs move (a fresher unit payload, a
 * mode switched mid-lesson) without ever showing the same card twice.
 */
export function wordsToMeet(
  plan: ReadonlyMap<string, readonly string[]>,
  exerciseId: string,
  introduced: ReadonlySet<string>,
): readonly string[] {
  return (plan.get(exerciseId) ?? []).filter((id) => !introduced.has(id));
}

/**
 * Whether tapping a match-pairs tile plays its word, as Duolingo does for a
 * target-language tile: the isiXhosa side only (the meanings are in the
 * learner's own language), never with listening off, and only when the word
 * has a recording. The speaker on the tile still plays it on request.
 */
export function playsOnTap(input: {
  readonly side: "xh" | "gloss";
  readonly listening: boolean;
  readonly hasClip: boolean;
}): boolean {
  return input.side === "xh" && input.listening && input.hasClip;
}

// ---------------------------------------------------------------------------
// Hearts inside a lesson
// ---------------------------------------------------------------------------

/** As much of the hearts state as the lesson header needs. */
export interface HeartsCount {
  readonly hearts: number;
  readonly max: number;
  readonly unlimited: boolean;
}

/**
 * What the lesson header shows on the right. `none` for a guest, who has no
 * hearts to lose; `unlimited` for Plus, drawn as ∞ the way Duolingo's Super
 * does it; otherwise the count.
 */
export type LessonHeartsView =
  | { readonly kind: "none" }
  | { readonly kind: "unlimited" }
  | { readonly kind: "count"; readonly hearts: number; readonly max: number };

/**
 * The hearts this lesson has cost, counted on the device so the header can
 * break a heart the moment a wrong answer is continued past rather than a
 * network round trip later. `anchor` is the server's latest word on the
 * count; `pending` the losses it has not confirmed since, either still in
 * flight or lost on the way (offline). The server stays the authority: the
 * header never shows more hearts than it says.
 */
export interface HeartsTally {
  readonly anchor: number | null;
  readonly pending: number;
}

export const NO_HEARTS_LOST: HeartsTally = { anchor: null, pending: 0 };

/** One wrong answer. Nothing to count for a guest, for Plus, or before the state is known. */
export function tallyHeartLost(
  tally: HeartsTally,
  state: HeartsCount | null | undefined,
  plus = false,
): HeartsTally {
  if (!state || state.unlimited || plus) return tally;
  return { anchor: tally.anchor ?? state.hearts, pending: tally.pending + 1 };
}

/**
 * The server's answer to one loss. Its count becomes the anchor and that
 * loss stops being pending, so the answer is never counted twice, whichever
 * of the answer and the refreshed hearts state reaches the screen first.
 * No answer (the request failed) keeps the loss counted here: a heart lost
 * offline stays lost for the rest of the lesson rather than coming back.
 */
export function tallyHeartAnswered(
  tally: HeartsTally,
  answer: HeartsCount | null | undefined,
): HeartsTally {
  if (!answer) return tally;
  if (answer.unlimited) return NO_HEARTS_LOST;
  return { anchor: answer.hearts, pending: Math.max(0, tally.pending - 1) };
}

/**
 * The header's hearts: the server's count, or the one this lesson's own
 * losses imply, whichever is lower. A heart regenerated during a lesson
 * shows once the server next answers, which is the price of never showing
 * a heart the learner has just lost.
 */
export function lessonHeartsView(
  state: HeartsCount | null | undefined,
  tally: HeartsTally = NO_HEARTS_LOST,
  plus = false,
): LessonHeartsView {
  if (!state) return { kind: "none" };
  if (state.unlimited || plus) return { kind: "unlimited" };
  const local = tally.anchor === null ? state.hearts : tally.anchor - tally.pending;
  return { kind: "count", hearts: Math.max(0, Math.min(state.hearts, local)), max: state.max };
}

/** How many hearts went between two header states: what starts the loss animation. */
export function heartsLostBetween(before: LessonHeartsView, after: LessonHeartsView): number {
  if (before.kind !== "count" || after.kind !== "count") return 0;
  return Math.max(0, before.hearts - after.hearts);
}

/** The lesson cannot go on: counted hearts, and none left. */
export function heartsRunOut(view: LessonHeartsView): boolean {
  return view.kind === "count" && view.hearts <= 0;
}

// ---------------------------------------------------------------------------
// Leaving halfway
// ---------------------------------------------------------------------------

/**
 * Whether leaving a lesson asks first (audit M06), on both platforms: once
 * an exercise is done the learner has answers to lose, until the lesson is
 * over and the celebration owns the screen. A lesson paused for hearts does
 * not ask either: its answers are already out of reach, and the ways out of
 * the pause (practise, Plus, later) are the lesson's own.
 */
export function mustConfirmExit({
  done,
  finished,
  paused = false,
}: {
  done: number;
  finished: boolean;
  paused?: boolean;
}): boolean {
  return done > 0 && !finished && !paused;
}
