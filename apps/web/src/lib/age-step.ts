import type { Me } from "./api.ts";

/**
 * Pages a signed-in account may still open while it owes the age step: the
 * legal texts it is agreeing to, and deleting the account. Everything else
 * renders the step instead.
 */
export const AGE_STEP_OPEN_PATHS: readonly string[] = [
  "/privacy",
  "/privacy/providers",
  "/terms",
  "/legal/company",
  "/licences",
  "/delete-account",
];

/** True when this page must give way to "Your birth year and country". */
export function ageStepBlocks(me: Me | null | undefined, pathname: string): boolean {
  if (me?.ageRequired !== true) return false;
  const bare = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return !AGE_STEP_OPEN_PATHS.includes(bare);
}

/** The learner's own data is only synced once the account is past the age step. */
export function accountReady(me: Me | null | undefined): me is Me {
  return !!me && me.ageRequired !== true;
}
