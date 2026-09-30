import { useReducedMotion } from "react-native-reanimated";

import { usePrefs } from "~/lib/prefs.tsx";

import { timing } from "./theme.ts";

/**
 * One place that knows whether motion is allowed. Reanimated reads the OS
 * "reduce motion" setting; when it is on we shorten to fades and skip
 * particles, per docs/DESIGN.md.
 *
 * Settings offers an explicit override for someone whose device setting does
 * not match what they want here (WCAG 2.3.3, and the same shape as apps/web):
 * the stored choice wins, and `null` follows the OS.
 */
export function useMotion() {
  const os = useReducedMotion();
  const { motion } = usePrefs();
  const reduced = motion ?? os;
  return {
    reduced,
    /** Duration for an enter animation; a short fade when motion is reduced. */
    enter: reduced ? 120 : timing.enter,
    stagger: reduced ? 0 : timing.stagger,
    particles: !reduced,
  };
}
