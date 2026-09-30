/**
 * Sign in with Apple token revocation (App Store guideline 5.1.1(v)): when an
 * account is deleted, the Apple grant it holds is revoked too. This module is
 * the pure half: which client owns a token, the exact requests to send, and
 * `revokeAppleTokens`, which sends them through a port the caller hands in
 * (apps/api wraps the Worker's `fetch`, the `molo` CLI Bun's). Nothing here
 * opens a connection or writes a log line of its own.
 *
 * Two Apple clients can issue a Molo token:
 *   - the Services ID (`APPLE_CLIENT_ID`) for the web redirect flow, and
 *   - the iOS bundle id (`APPLE_APP_BUNDLE_IDENTIFIER`) for the native sheet,
 *     whose refresh token comes from exchanging the sheet's authorization code.
 * Each has its own client secret, a JWT whose `sub` is that client id. A token
 * may only be revoked by the client it was issued to, and the account row does
 * not record which one that was, so every configured client is asked.
 *
 * https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens
 * https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens
 */

export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

/** Apple is asked with a short deadline: deletion never waits on it for long. */
export const APPLE_REQUEST_TIMEOUT_MS = 3_000;

export interface AppleClient {
  readonly clientId: string;
  /** The ES256 client-secret JWT for this client id. Never logged. */
  readonly clientSecret: string;
}

/** The Apple credentials the API and CLI read from their environment. */
export interface AppleClientEnv {
  readonly APPLE_CLIENT_ID?: string | undefined;
  readonly APPLE_CLIENT_SECRET?: string | undefined;
  readonly APPLE_APP_BUNDLE_IDENTIFIER?: string | undefined;
  readonly APPLE_APP_CLIENT_SECRET?: string | undefined;
}

/** The web client (Services ID), when both halves are configured. */
export function appleWebClient(env: AppleClientEnv): AppleClient | null {
  return env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
    ? { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET }
    : null;
}

/** The native client (bundle id), when both halves are configured. */
export function appleAppClient(env: AppleClientEnv): AppleClient | null {
  return env.APPLE_APP_BUNDLE_IDENTIFIER && env.APPLE_APP_CLIENT_SECRET
    ? { clientId: env.APPLE_APP_BUNDLE_IDENTIFIER, clientSecret: env.APPLE_APP_CLIENT_SECRET }
    : null;
}

export function appleClients(env: AppleClientEnv): AppleClient[] {
  return [appleWebClient(env), appleAppClient(env)].filter((c): c is AppleClient => c !== null);
}

/** The token columns of one `account` row with providerId 'apple'. */
export interface AppleTokenRow {
  readonly refreshToken: string | null;
  readonly accessToken: string | null;
  readonly idToken: string | null;
}

export type AppleTokenTypeHint = "refresh_token" | "access_token";

export interface AppleRevocation {
  readonly client: AppleClient;
  readonly token: string;
  readonly tokenTypeHint: AppleTokenTypeHint;
}

export interface AppleRevocationPlan {
  /** One group per token; the token counts as revoked when any request in its group succeeds. */
  readonly groups: readonly (readonly AppleRevocation[])[];
  /** Apple rows with no refresh or access token (a native sign-in before the code exchange). */
  readonly withoutToken: number;
  /** Rows with a token but no configured client to revoke it with. */
  readonly withoutClient: number;
}

/**
 * Reads a JWT's claims without verifying it. Only for routing (which client
 * issued a token, whose subject it names) on tokens that came straight from
 * Apple or from our own database, never to authenticate anyone.
 */
export function unverifiedJwtClaims(
  jwt: string | null | undefined,
): Record<string, unknown> | null {
  if (!jwt) return null;
  const parts = jwt.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || !payload) return null;
  try {
    const claims: unknown = JSON.parse(base64UrlToUtf8(payload));
    return typeof claims === "object" && claims !== null && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url → UTF-8 text in plain ECMAScript (this package has no Web APIs). Throws on bad input. */
function base64UrlToUtf8(input: string): string {
  let bits = 0;
  let value = 0;
  let escaped = "";
  for (const ch of input.replace(/=+$/, "")) {
    const n = B64.indexOf(ch);
    if (n < 0) throw new Error("not base64url");
    value = (value << 6) | n;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      escaped += `%${((value >> bits) & 0xff).toString(16).padStart(2, "0")}`;
    }
  }
  return decodeURIComponent(escaped);
}

/**
 * The revocations for a user's Apple accounts. The refresh token is preferred
 * (revoking it ends the whole grant); an access token is the fallback. The
 * client named in the stored id token's audience goes first, the others after,
 * because a web sign-in followed by a native one can leave a web refresh token
 * next to a native id token.
 */
export function planAppleRevocations(
  rows: readonly AppleTokenRow[],
  clients: readonly AppleClient[],
): AppleRevocationPlan {
  const groups: AppleRevocation[][] = [];
  let withoutToken = 0;
  let withoutClient = 0;
  for (const row of rows) {
    const token = row.refreshToken ?? row.accessToken;
    if (!token) {
      withoutToken++;
      continue;
    }
    if (clients.length === 0) {
      withoutClient++;
      continue;
    }
    const tokenTypeHint: AppleTokenTypeHint = row.refreshToken ? "refresh_token" : "access_token";
    const aud = unverifiedJwtClaims(row.idToken)?.["aud"];
    const ordered = [...clients].sort(
      (a, b) => Number(b.clientId === aud) - Number(a.clientId === aud),
    );
    groups.push(ordered.map((client) => ({ client, token, tokenTypeHint })));
  }
  return { groups, withoutToken, withoutClient };
}

export interface FormRequest {
  readonly url: string;
  readonly init: {
    readonly method: "POST";
    readonly headers: Record<string, string>;
    readonly body: string;
  };
}

function form(url: string, fields: Record<string, string>): FormRequest {
  return {
    url,
    init: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: Object.entries(fields)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&"),
    },
  };
}

/** POST /auth/revoke for one token. The body carries secrets: never log it. */
export function appleRevokeRequest(r: AppleRevocation): FormRequest {
  return form(APPLE_REVOKE_URL, {
    client_id: r.client.clientId,
    client_secret: r.client.clientSecret,
    token: r.token,
    token_type_hint: r.tokenTypeHint,
  });
}

/**
 * POST /auth/token exchanging the native sheet's one-time authorization code
 * (valid five minutes) for the refresh token deletion later revokes. A native
 * code needs no redirect_uri.
 */
export function appleCodeExchangeRequest(client: AppleClient, code: string): FormRequest {
  return form(APPLE_TOKEN_URL, {
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
    grant_type: "authorization_code",
  });
}

export interface AppleTokenResponse {
  readonly refreshToken: string;
  readonly accessToken: string | null;
  readonly idToken: string | null;
  /** Seconds the access token lives. */
  readonly expiresIn: number | null;
}

/** Apple's token response, or null when it carries no refresh token. */
export function parseAppleTokenResponse(body: unknown): AppleTokenResponse | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  const refreshToken = str(b["refresh_token"]);
  if (!refreshToken) return null;
  return {
    refreshToken,
    accessToken: str(b["access_token"]),
    idToken: str(b["id_token"]),
    expiresIn: typeof b["expires_in"] === "number" ? b["expires_in"] : null,
  };
}

/**
 * The one network call revocation needs, supplied by the caller: send the
 * form request, give up after `timeoutMs`, and reject on a network failure
 * (an error named `TimeoutError` is reported as a timeout).
 */
export type FormPort = (
  req: FormRequest,
  timeoutMs: number,
) => Promise<{ readonly ok: boolean; readonly status: number }>;

export interface AppleRevokeFailure {
  readonly clientId: string;
  /** An HTTP status, or `timeout` / `network`. */
  readonly status: string;
}

export interface AppleRevokeOutcome {
  /** Tokens Apple accepted a revocation for. */
  readonly revoked: number;
  /** Tokens no configured client could revoke (network, timeout or refusal). */
  readonly failed: number;
  /** Apple accounts with no stored token, or no client configured to revoke it. */
  readonly skipped: number;
  readonly withoutToken: number;
  readonly withoutClient: number;
  /** Every attempt of every failed token, for the caller's log. No token or secret. */
  readonly failures: readonly AppleRevokeFailure[];
}

/**
 * Revokes every Apple token in `rows` and never throws: failures come back
 * in the outcome for the caller to log. Each token goes to every configured
 * client at once, since the row does not say which client issued it; one 2xx
 * counts as revoked. Every request carries a deadline of `timeoutMs`.
 */
export async function revokeAppleTokens(
  rows: readonly AppleTokenRow[],
  clients: readonly AppleClient[],
  send: FormPort,
  timeoutMs = APPLE_REQUEST_TIMEOUT_MS,
): Promise<AppleRevokeOutcome> {
  const plan = planAppleRevocations(rows, clients);
  const failures: AppleRevokeFailure[] = [];
  const results = await Promise.all(
    plan.groups.map(async (group) => {
      const attempts = await Promise.all(
        group.map(async (r): Promise<AppleRevokeFailure & { ok: boolean }> => {
          try {
            const res = await send(appleRevokeRequest(r), timeoutMs);
            return { clientId: r.client.clientId, status: String(res.status), ok: res.ok };
          } catch (e) {
            const name = (e as { name?: unknown } | null)?.name;
            const status = name === "TimeoutError" ? "timeout" : "network";
            return { clientId: r.client.clientId, status, ok: false };
          }
        }),
      );
      if (attempts.some((a) => a.ok)) return true;
      for (const a of attempts) failures.push({ clientId: a.clientId, status: a.status });
      return false;
    }),
  );
  const revoked = results.filter(Boolean).length;
  return {
    revoked,
    failed: results.length - revoked,
    skipped: plan.withoutToken + plan.withoutClient,
    withoutToken: plan.withoutToken,
    withoutClient: plan.withoutClient,
    failures,
  };
}

/** Accounts that never answered the age step are deleted after this long (privacy policy). */
export const AGE_PENDING_RETENTION_DAYS = 7;

/** The creation time before which an age-pending account is deleted. */
export function agePendingCutoff(now: Date, days = AGE_PENDING_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}
