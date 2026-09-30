import type { ExercisePayload, UnitResponse } from "@molo/core";

export type Content = Pick<
  UnitResponse,
  "lexemes" | "sentences" | "audioAssets" | "sourceLang" | "clickAudio"
>;

export interface ExerciseProps<P extends ExercisePayload = ExercisePayload> {
  payload: P;
  content: Content;
  /** Called once per exercise with the outcome. */
  onDone: (result: { correct: boolean; xp: number }) => void;
  /** Listening is off: show the isiXhosa as text instead of playing it. */
  quiet?: boolean | undefined;
}

export function lexemeOf(content: Content, id: string) {
  return content.lexemes[id] ?? null;
}

export function glossOf(content: Content, id: string): string {
  return content.lexemes[id]?.gloss?.gloss ?? "?";
}

export function shuffle<T>(items: readonly T[], seed: number): T[] {
  // Deterministic per exercise so SSR and client agree.
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
