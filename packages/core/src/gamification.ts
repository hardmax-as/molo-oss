/**
 * Gamification constants and pure functions (ARCHITECTURE section 4).
 * `packages/gamification` adds the db adapters; the arithmetic lives here so
 * clients can show the same numbers the server writes.
 */

export const XP = {
  correct: 10,
  perfectLessonBonus: 20,
  clickDrillCorrect: 15,
  speakAttempt: 5,
  /** The chest at the end of a skill, granted once per learner per skill. */
  skillChest: 25,
} as const;

/**
 * How steep the level curve is. The divisor is a parameter rather than a
 * literal so the developer gallery's knobs panel can show what a different
 * curve would feel like without a rebuild; the server always uses the
 * default, and it is the server that decides what a learner has earned.
 */
export const XP_LEVEL_DIVISOR = 50;

/** `level(xp) = floor(sqrt(xp / 50))`: 50 XP is L1, 200 is L2, 450 is L3. */
export function levelForXp(totalXp: number, divisor = XP_LEVEL_DIVISOR): number {
  if (!Number.isFinite(totalXp) || totalXp < 0) return 0;
  if (!Number.isFinite(divisor) || divisor <= 0) return 0;
  return Math.floor(Math.sqrt(totalXp / divisor));
}

export function xpForLevel(level: number, divisor = XP_LEVEL_DIVISOR): number {
  if (level <= 0) return 0;
  return level * level * divisor;
}

/** A unit crown needs every lexeme in FSRS state `review` with stability of at least this many days. */
export const CROWN_MIN_STABILITY_DAYS = 21;

export const DEFAULT_DAILY_GOAL_XP = 50;

/**
 * Molo Plus (docs/MONETISATION.md). Product identifiers are the same in
 * App Store Connect, Google Play and RevenueCat Web Billing; the display
 * prices here are the intended list prices and are replaced by the store's
 * localised price at runtime.
 */
export const PLUS_ENTITLEMENT = "plus";
export const PLUS_PRODUCTS = {
  monthly: { id: "molo_plus_monthly", nok: 79, usd: 6.99 },
  yearly: { id: "molo_plus_yearly", nok: 599, usd: 49.99 },
} as const;
