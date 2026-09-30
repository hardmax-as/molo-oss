/**
 * Pure helpers for the exercise widgets. No React Native imports, so the
 * Jest suite can cover them without a native environment.
 */

import { clickSoundById, distinctByLabel, optionLabelKey, type ClickSound } from "@molo/core";

const CLICKS = new Set(["c", "x", "q"]);

/** Splits a word into runs so click letters can be painted in their colours (docs/DESIGN.md). */
export function clickRuns(text: string): { text: string; click: string | null }[] {
  const out: { text: string; click: string | null }[] = [];
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const click = CLICKS.has(lower) ? lower : null;
    const last = out[out.length - 1];
    if (last && last.click === click) last.text += ch;
    else out.push({ text: ch, click });
  }
  return out;
}

/** Which click letters the expected answer contains, in order of first appearance. */
export function clicksIn(text: string): string[] {
  return [...new Set([...text.toLowerCase()].filter((c) => CLICKS.has(c)))];
}

/** Same deterministic shuffle as apps/web, so both clients agree per exercise. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function seedOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export interface ResolvedBlank {
  readonly position: number;
  readonly answer: string;
  readonly options: string[];
}

/** Blanks resolved against the sentence tokens; the correct form is the token's surface form at that position. */
export function resolveBlanks(
  sentenceId: string,
  blanks: ReadonlyArray<{ position: number; distractors: ReadonlyArray<string> }>,
  tokens: ReadonlyArray<{ position: number; surfaceForm: string }>,
): ResolvedBlank[] {
  return blanks
    .map((b) => {
      const token = tokens.find((k) => k.position === b.position);
      if (!token) return null;
      const options = shuffle(
        [...new Set([token.surfaceForm, ...b.distractors])],
        seedOf(`${sentenceId}:${b.position}`),
      );
      return { position: b.position, answer: token.surfaceForm, options };
    })
    .filter((b): b is ResolvedBlank => b !== null);
}

export interface ExerciseModes {
  readonly listening: boolean;
  readonly speaking: boolean;
}

/**
 * Which exercises a lesson runs under the learner's modes: with listening
 * off, click drills and bare-click identification are skipped (listen_select
 * and select_listen switch to their reading variant instead); with speaking
 * off, speak exercises go.
 */
export function filterExercises<T extends { type: string }>(
  exercises: readonly T[],
  modes: ExerciseModes,
): T[] {
  return exercises.filter((e) => {
    if (!modes.listening && (e.type === "click_drill" || e.type === "click_identify")) return false;
    if (!modes.speaking && e.type === "speak") return false;
    return true;
  });
}

/** How a lexeme reads on a tile: its lemma and the learner's gloss. */
export type TileLabelOf = (
  lexemeId: string,
) => { readonly lemma?: string | null; readonly gloss?: string | null } | null;

const tileLabels = (labelOf: TileLabelOf, id: string) =>
  [
    ["xh", labelOf(id)?.lemma],
    ["gloss", labelOf(id)?.gloss],
  ] as const;

/**
 * Options with no two tiles that read the same (audit M02). The publish gate
 * refuses such an exercise; this is the client's guard for one that is
 * already out, or whose gloss changed later. The correct option always stays.
 */
export function distinctOptions<O extends { lexemeId: string; correct: boolean }>(
  options: readonly O[],
  labelOf: TileLabelOf,
): O[] {
  return distinctByLabel(
    options,
    (o) => tileLabels(labelOf, o.lexemeId),
    (o) => o.correct,
  );
}

/** Match-pairs rows with no two words, or two meanings, that read the same. */
export function distinctPairIds(ids: readonly string[], labelOf: TileLabelOf): string[] {
  return distinctByLabel(ids, (id) => tileLabels(labelOf, id));
}

/**
 * Whether choosing `picked` answers for `expected`: the same lexeme, or one
 * whose tile reads the same in the field the learner chose by. A learner is
 * never marked wrong for a tile identical to the right one.
 */
export function sameTile(
  picked: string | null,
  expected: string,
  labelOf: TileLabelOf,
  field: "lemma" | "gloss",
): boolean {
  if (picked === null) return false;
  if (picked === expected) return true;
  const a = labelOf(picked)?.[field];
  const b = labelOf(expected)?.[field];
  if (!a || !b) return false;
  const key = optionLabelKey(a);
  return key !== "" && key === optionLabelKey(b);
}

/** The tiles a click_identify offers: its clicks, in the payload's order; unknown ids drop out. */
export function clickChoices(clickIds: readonly string[]): ClickSound[] {
  return clickIds.flatMap((id) => clickSoundById(id) ?? []);
}

/**
 * The rounds a click_identify plays: every click that has a recording, once
 * each, shuffled the same way on every render and on the web. A click with
 * no published take is not played (there is nothing to play), but it stays
 * among the tiles.
 */
export function clickRounds(
  set: string,
  clickIds: readonly string[],
  clickAudio: Readonly<Record<string, unknown>> | undefined,
): ClickSound[] {
  const playable = clickChoices(clickIds).filter((c) => clickAudio?.[c.id]);
  return shuffle(playable, seedOf(`${set}:${clickIds.join()}`));
}
