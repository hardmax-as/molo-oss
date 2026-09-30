/**
 * Pure helpers behind Sign in with Apple and Google (src/lib/social-auth.ts),
 * kept free of native modules so they run under Jest.
 */

const NONCE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * The nonce that ties Apple's id token to this sign-in. The same value goes
 * to Apple (who echoes it inside the token) and to Better Auth, whose Apple
 * provider compares it exactly or by its SHA-256 (`nonceComparison:
 * "exact-or-sha256"` in @better-auth/core 1.7.2), so no hashing is needed
 * on the device. Uses the platform's CSPRNG when Hermes exposes one.
 */
export function randomNonce(length = 32): string {
  const bytes = new Uint8Array(length);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => NONCE_CHARS.charAt(b % NONCE_CHARS.length)).join("");
}

export interface AppleName {
  givenName?: string | null | undefined;
  familyName?: string | null | undefined;
}

export interface SocialUser {
  name?: { firstName?: string; lastName?: string };
  email?: string;
}

/**
 * Apple sends the name and email only on the first sign-in, and only when
 * the person allowed it. Anything present is passed on so the account gets
 * a real name instead of the token's opaque subject.
 */
export function appleUser(fullName: AppleName | null, email: string | null): SocialUser | null {
  const user: SocialUser = {};
  const first = fullName?.givenName?.trim();
  const last = fullName?.familyName?.trim();
  if (first || last) {
    user.name = { ...(first ? { firstName: first } : {}), ...(last ? { lastName: last } : {}) };
  }
  if (email?.trim()) user.email = email.trim();
  return user.name || user.email ? user : null;
}

/** expo-apple-authentication rejects with this code when the sheet is dismissed. */
export function isAppleCancel(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && (e as { code?: unknown }).code === "ERR_REQUEST_CANCELED"
  );
}

/**
 * Which social buttons a platform may show, given what the server enables.
 * Apple is iOS-only. On iOS, Google appears only alongside Apple: App Store
 * guideline 4.8 requires Sign in with Apple wherever another social sign-in
 * is offered, so a server with Apple switched off must not leave Google alone
 * on an iPhone. `dev` keeps both visible in development builds for design.
 */
export function visibleSocialProviders(
  os: string,
  enabled: { apple: boolean; google: boolean },
  dev = false,
): { apple: boolean; google: boolean } {
  const apple = os === "ios" && (enabled.apple || dev);
  const google = (enabled.google || dev) && (os !== "ios" || apple);
  return { apple, google };
}
