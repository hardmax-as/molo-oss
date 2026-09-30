import { Schema } from "effect";

/** Registration input. Only the validated country and eligibility result are retained. */
export const AgeDeclaration = Schema.Struct({
  birthYear: Schema.Int.pipe(Schema.between(1900, 9999)),
  country: Schema.Literal("ZA", "NO", "OTHER"),
  ageReached: Schema.optional(Schema.Boolean),
});
export type AgeDeclaration = typeof AgeDeclaration.Type;
export type AgeCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid" | "under13" | "under18ZA" | "confirm" };

export function ageEligibility(raw: unknown, now = new Date()): AgeCheck {
  const decoded = Schema.decodeUnknownEither(AgeDeclaration)(raw);
  if (decoded._tag === "Left") return { ok: false, reason: "invalid" };
  const { birthYear, country, ageReached } = decoded.right;
  const years = now.getUTCFullYear() - birthYear;
  if (years < 0) return { ok: false, reason: "invalid" };
  const minimum = country === "ZA" ? 18 : 13;
  if (years < minimum) return { ok: false, reason: country === "ZA" ? "under18ZA" : "under13" };
  // A year alone cannot tell whether this year's birthday has happened.
  if (years === minimum && ageReached !== true) return { ok: false, reason: "confirm" };
  return { ok: true };
}

/**
 * The age step after a one-tap Apple or Google sign-up. The account exists,
 * but until `POST /me/age` accepts a declaration the API answers every other
 * signed-in request with 403 and this code.
 */
export const AGE_REQUIRED = "age_required";
/** `POST /me/age` refused a declaration below the minimum age: the account is already deleted. */
export const AGE_UNDER_MINIMUM = "age_under_minimum";
/** `POST /me/age` could not accept the input (malformed, or the boundary year unconfirmed). */
export const AGE_INVALID = "age_invalid";

/** What a client shows after `POST /me/age`, from the API's error code and `details.reason`. */
export type AgeStepOutcome =
  | { readonly kind: "confirmed" }
  | { readonly kind: "deleted"; readonly reason: "under13" | "under18ZA" }
  | { readonly kind: "retry"; readonly reason: "invalid" | "confirm" | "generic" };

export function ageStepOutcome(
  error: { code?: string | undefined; details?: unknown } | null | undefined,
): AgeStepOutcome {
  if (!error) return { kind: "confirmed" };
  const reason = (error.details as { reason?: unknown } | null | undefined)?.reason;
  if (error.code === AGE_UNDER_MINIMUM)
    return { kind: "deleted", reason: reason === "under18ZA" ? "under18ZA" : "under13" };
  if (error.code === AGE_INVALID)
    return { kind: "retry", reason: reason === "confirm" ? "confirm" : "invalid" };
  return { kind: "retry", reason: "generic" };
}
