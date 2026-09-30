/** Pure easing helpers shared by the count-up hook and the tests (no React import). */

/** Ease-out cubic, the same curve the XP chip and the summary use. */
export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Value shown at time `t` (0..1) between `from` and `to`, rounded to an integer. */
export function countAt(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * easeOut(Math.max(0, Math.min(1, t))));
}
