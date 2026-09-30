import type { ExercisePayload, UnitResponse } from "@molo/core";

export type Content = Pick<
  UnitResponse,
  "lexemes" | "sentences" | "audioAssets" | "sourceLang" | "clickAudio"
>;

/**
 * What a widget reports when it is done. `skipped` is for exercises the
 * learner never got to answer (no recording, microphone denied, an unknown
 * type): they earn nothing, cost no heart and stay out of the score.
 */
export interface ExerciseResult {
  correct: boolean;
  xp: number;
  skipped?: boolean;
}

export const SKIPPED: ExerciseResult = { correct: false, xp: 0, skipped: true };

export interface ExerciseProps<P extends ExercisePayload = ExercisePayload> {
  payload: P;
  content: Content;
  onDone: (result: ExerciseResult) => void;
}

export function lexemeOf(content: Content, id: string) {
  return content.lexemes[id] ?? null;
}

export function glossOf(content: Content, id: string): string {
  return content.lexemes[id]?.gloss?.gloss ?? "?";
}

/** How each lexeme reads on a tile, for the collision guards in helpers.ts. */
export function tileLabelOf(content: Content) {
  return (id: string) => {
    const lx = content.lexemes[id];
    return lx ? { lemma: lx.lemma, gloss: lx.gloss?.gloss ?? null } : null;
  };
}

export { distinctOptions, distinctPairIds, sameTile, seedOf, shuffle } from "./helpers.ts";
