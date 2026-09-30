/** Names of the generated sounds in ./sounds; both apps map these to their own players. */
export const SOUNDS = [
  "correct",
  "wrong",
  "tap",
  "lesson_complete",
  "perfect",
  "streak",
  "level_up",
  "crown",
  "cue",
] as const;
export type SoundName = (typeof SOUNDS)[number];
