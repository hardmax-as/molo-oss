/**
 * Consent for deleting an account. The learner types a confirmation word in
 * their interface language ("DELETE", "SLETT"; `account.confirmWord` in
 * packages/i18n), the client checks it with `confirmWordMatches`, and sends
 * the language-independent token below. Typing the account's email address is
 * no longer asked: for a Sign in with Apple "Hide My Email" account it is a
 * random relay address, which App Review treats as an obstacle to deletion
 * (guideline 5.1.1(v)). Builds from before this change still send
 * `confirmEmail`, and the API keeps accepting it.
 */

export const ACCOUNT_DELETE_CONFIRMATION = "delete-my-account" as const;

export interface DeleteAccountBody {
  readonly confirm?: unknown;
  readonly confirmEmail?: unknown;
}

/** True when the typed text is the confirmation word, ignoring case and surrounding space. */
export function confirmWordMatches(typed: string, word: string): boolean {
  const norm = (s: string) => s.trim().normalize("NFC").toLocaleUpperCase();
  return typed.trim() !== "" && norm(typed) === norm(word);
}

/** The API's decision: the current token, or (older builds) the account's own email. */
export function deletionConfirmed(body: DeleteAccountBody | null, accountEmail: string): boolean {
  if (!body) return false;
  if (body.confirm === ACCOUNT_DELETE_CONFIRMATION) return true;
  return (
    typeof body.confirmEmail === "string" &&
    body.confirmEmail.trim() !== "" &&
    body.confirmEmail.trim().toLowerCase() === accountEmail.toLowerCase()
  );
}
