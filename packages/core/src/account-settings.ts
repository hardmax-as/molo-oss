import { Schema } from "effect";

/**
 * The account name: private, shown to the learner themself ("Signed in as
 * …") and, as its first word only, in a league when no display name is set.
 * Leagues run that word through the name filter at read time, so the account
 * name itself is only held to shape: 1–80 characters after trimming, with no
 * control or invisible formatting characters.
 */
export const ACCOUNT_NAME_MAX = 80;

/** The trimmed name, or null when it cannot be an account name. */
export function normaliseAccountName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length === 0 || name.length > ACCOUNT_NAME_MAX) return null;
  if (/[\p{Cc}\p{Cf}]/u.test(name)) return null;
  return name;
}

/** Better Auth's floor for a new password (apps/api/src/auth.ts, `minPasswordLength`). */
export const PASSWORD_MIN_LENGTH = 10;
/** Better Auth's default ceiling for a password. */
export const PASSWORD_MAX_LENGTH = 128;

/**
 * `POST /me/password`: the first password on an account that signs in only
 * with Apple or Google. Changing an existing one goes through Better Auth's
 * own `/change-password`, which asks for the current password.
 */
export const SetPasswordRequest = Schema.Struct({
  newPassword: Schema.String.pipe(
    Schema.minLength(PASSWORD_MIN_LENGTH),
    Schema.maxLength(PASSWORD_MAX_LENGTH),
  ),
});
export type SetPasswordRequest = typeof SetPasswordRequest.Type;

/**
 * Whether the account can sign in with e-mail and password (Better Auth's
 * `credential` account). Settings offers "Change password" when it can and
 * "Set a password" when it signs in only with Apple or Google.
 */
export function hasPasswordSignIn(providerIds: readonly string[]): boolean {
  return providerIds.includes("credential");
}

/** What the clients say about a refused password change, from Better Auth's code. */
export type PasswordRefusal = "wrong" | "short" | "generic";

export function passwordRefusal(code: string | undefined): PasswordRefusal {
  if (code === "INVALID_PASSWORD") return "wrong";
  if (code === "PASSWORD_TOO_SHORT") return "short";
  return "generic";
}
