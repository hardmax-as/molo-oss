import { ageEligibility, ageStepOutcome, type AgeStepOutcome } from "@molo/core";

import type { Me } from "./api.ts";

export interface AgeStepDeclaration {
  birthYear: number;
  country: string;
  ageReached: boolean;
}

export interface AgeStepPorts {
  /** `POST /me/age`; throws the API's error (code and details) when refused. */
  confirm: (declaration: AgeStepDeclaration) => Promise<unknown>;
  /** Work that waited for the account: onboarding choices made as a guest. */
  afterConfirmed: () => Promise<void>;
}

/** True while this account must see "Your birth year and country" before anything else. */
export function showAgeStep(me: Me | null | undefined): boolean {
  return me?.ageRequired === true;
}

/** The learner's own data is only synced once the account is past the age step. */
export function accountReady(me: Me | null | undefined): me is Me {
  return !!me && me.ageRequired !== true;
}

/**
 * One press of "Continue" on the age step. Input the rule can fix (empty, or
 * the boundary year unconfirmed) is refused here without a request; an
 * under-age answer is sent, because the server then deletes the account.
 */
export async function submitAgeStep(
  declaration: AgeStepDeclaration,
  ports: AgeStepPorts,
): Promise<AgeStepOutcome> {
  const local = ageEligibility(declaration);
  if (!local.ok && (local.reason === "invalid" || local.reason === "confirm"))
    return { kind: "retry", reason: local.reason };
  try {
    await ports.confirm(declaration);
  } catch (e) {
    const err = e as { code?: unknown; details?: unknown } | null;
    return ageStepOutcome({
      ...(typeof err?.code === "string" ? { code: err.code } : { code: "unknown" }),
      details: err?.details,
    });
  }
  await ports.afterConfirmed();
  return { kind: "confirmed" };
}
