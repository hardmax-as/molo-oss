/** Pure onboarding data (no native imports; covered by Jest). */

export const GOAL_PRESETS = [
  { key: "casual", xp: 20 },
  { key: "regular", xp: 50 },
  { key: "serious", xp: 100 },
] as const;

export const ONBOARDING_STEPS = ["hello", "language", "goal", "where", "clicks", "ready"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Onboarded? Signed in: the server's `onboardedAt` when the API sends the
 * field (null means not yet), or the device flag. Guest: the device flag.
 */
export function onboardedFrom(
  signedIn: boolean,
  serverOnboardedAt: string | null | undefined,
  local: boolean,
): boolean {
  if (signedIn && serverOnboardedAt !== undefined) return serverOnboardedAt !== null || local;
  return local;
}

/**
 * The recording to play on "Meet the clicks" for c, x or q: the published
 * plain click (audit M10), or null, in which case the row has no play
 * button at all. Never a TTS stand-in: `GET /clicks` serves tier 1 only.
 */
export function onboardingClickUrl(
  clicks: readonly { base: string; variant: string; audio: { url: string } }[] | undefined,
  base: "c" | "x" | "q",
): string | null {
  return clicks?.find((c) => c.base === base && c.variant === "plain")?.audio.url ?? null;
}

/** Next step index clamped to the first step; -1 means "leave". */
export function nextStep(index: number, direction: 1 | -1): number {
  const next = index + direction;
  if (next < 0) return 0;
  if (next >= ONBOARDING_STEPS.length) return -1;
  return next;
}
