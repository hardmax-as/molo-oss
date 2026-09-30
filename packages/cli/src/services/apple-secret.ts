/**
 * Sign in with Apple's "client secret" is not a stored value: it is a JWT the
 * developer signs with a Sign in with Apple key (.p8) and that Apple accepts
 * for at most six months. Better Auth takes the finished JWT as
 * `clientSecret`, so it has to be regenerated and redeployed before it
 * expires. This module builds it with WebCrypto only.
 *
 * Header  { alg: ES256, kid: <key id> }
 * Payload { iss: <team id>, iat, exp (≤ 180 days), aud: https://appleid.apple.com, sub: <client id> }
 */

export const APPLE_AUDIENCE = "https://appleid.apple.com";
export const MAX_DAYS = 180;

export interface AppleSecretInput {
  /** Contents of the .p8 file (PEM). */
  readonly pem: string;
  /** The 10-character key id shown next to the key in the developer portal. */
  readonly keyId: string;
  /** The Apple Developer team id. */
  readonly teamId: string;
  /** Services ID for the web flow (com.hardmax.molo.web); the bundle id for a native-only secret. */
  readonly clientId: string;
  /** Validity in days, at most 180. */
  readonly days: number;
  /** Signing time; defaults to now. */
  readonly now?: Date;
}

export function base64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Reads expiry only; this deliberately does not authenticate or verify the JWT. */
export function decodeAppleSecretExpiry(jwt: string): number {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
      throw new Error();
    }
    const payload = parts[1]!;
    const bytes = Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    const claims: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (typeof claims !== "object" || claims === null || !("exp" in claims)) {
      throw new Error();
    }
    const exp = claims.exp;
    if (typeof exp !== "number" || !Number.isSafeInteger(exp) || exp < 0 || exp > 8.64e12) {
      throw new Error();
    }
    return exp;
  } catch {
    // Parser errors can include their input. Never let the secret reach logs.
    throw new Error("APPLE_CLIENT_SECRET must be a JWT with a valid numeric exp claim");
  }
}

/** Whole days remaining: 29 days and 23 hours must still fail a 30-day warning. */
export function appleSecretDaysLeft(jwt: string, now = new Date()): number {
  if (!Number.isFinite(now.getTime())) throw new Error("expiry check requires a valid date");
  return Math.floor((decodeAppleSecretExpiry(jwt) - now.getTime() / 1000) / 86_400);
}

/** PEM → DER bytes; accepts the "PRIVATE KEY" block Apple ships and tolerates CRLF. */
export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  if (body === "") throw new Error("empty key file");
  const bin = atob(body);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function importAppleKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** The claims we will sign, so a dry run can show them without the key. */
export function appleSecretClaims(input: Omit<AppleSecretInput, "pem">) {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_DAYS) {
    throw new Error(`days must be between 1 and ${MAX_DAYS}`);
  }
  if (!/^[A-Z0-9]{10}$/.test(input.keyId))
    throw new Error("key id must be 10 characters (A–Z, 0–9)");
  if (!/^[A-Z0-9]{10}$/.test(input.teamId))
    throw new Error("team id must be 10 characters (A–Z, 0–9)");
  if (input.clientId.trim() === "") throw new Error("client id is required");
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  return {
    iss: input.teamId,
    iat,
    exp: iat + input.days * 86_400,
    aud: APPLE_AUDIENCE,
    sub: input.clientId,
  };
}

/** Builds and signs the JWT. The returned string is the secret; never log it. */
export async function makeAppleClientSecret(input: AppleSecretInput): Promise<string> {
  const claims = appleSecretClaims(input);
  const header = { alg: "ES256", kid: input.keyId };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const key = await importAppleKey(input.pem);
  // WebCrypto ECDSA emits the raw r||s form that JWS ES256 expects (no DER wrapping).
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(sig))}`;
}

/** Inserts or replaces `KEY=value` lines in a dotenv file body; values are single-quoted. */
export function upsertDotenv(body: string, entries: Record<string, string>): string {
  const lines = body === "" ? [] : body.replace(/\n$/, "").split("\n");
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.exec(line);
    if (!m) return line;
    const k = m[1] as string;
    if (!(k in entries)) return line;
    seen.add(k);
    return `${k}='${entries[k]}'`;
  });
  for (const [k, v] of Object.entries(entries)) if (!seen.has(k)) next.push(`${k}='${v}'`);
  const joined = next.join("\n");
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}
