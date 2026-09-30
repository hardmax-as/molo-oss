/**
 * The network half of Sign in with Apple token handling (the pure half is
 * @molo/core `apple-revoke.ts`): revoking a deleted user's grant, and turning
 * the native sheet's authorization code into a refresh token that can later be
 * revoked. Every request has a short deadline, and no token, code or secret
 * ever reaches a log line: only the event name, the client id and a status.
 */

import {
  APPLE_REQUEST_TIMEOUT_MS,
  appleAppClient,
  appleClients,
  appleCodeExchangeRequest,
  parseAppleTokenResponse,
  revokeAppleTokens as revokeWith,
  unverifiedJwtClaims,
  type AppleClientEnv,
  type AppleRevokeOutcome,
  type AppleTokenResponse,
  type AppleTokenRow,
  type FormRequest,
} from "@molo/core";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export type { AppleRevokeOutcome };

/**
 * Revokes every Apple token in `rows` with the clients this Worker is
 * configured for. Never throws: a failure is a log line
 * (`auth.apple_revoke_failed client=<id> status=<code>`) and the caller goes
 * on to delete the account.
 */
export async function revokeAppleTokens(
  rows: readonly AppleTokenRow[],
  env: AppleClientEnv,
  fetchImpl: Fetch = fetch,
  timeoutMs = APPLE_REQUEST_TIMEOUT_MS,
): Promise<AppleRevokeOutcome> {
  const send = (req: FormRequest, ms: number) =>
    fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(ms) });
  const out = await revokeWith(rows, appleClients(env), send, timeoutMs);
  if (out.withoutClient > 0)
    console.warn(`auth.apple_revoke_skipped reason=no_client count=${out.withoutClient}`);
  if (out.withoutToken > 0)
    console.warn(`auth.apple_revoke_skipped reason=no_token count=${out.withoutToken}`);
  for (const f of out.failures)
    console.warn(`auth.apple_revoke_failed client=${f.clientId} status=${f.status}`);
  return out;
}

export type AppleCodeExchange =
  | { readonly ok: true; readonly subject: string; readonly tokens: AppleTokenResponse }
  | { readonly ok: false; readonly reason: "not_configured" | "refused" | "unreachable" };

/**
 * Exchanges a native authorization code at Apple's token endpoint with the
 * bundle id's client secret. The subject is read from the id token Apple
 * returns over this TLS connection, so the caller can match it to the
 * account it belongs to.
 */
export async function exchangeAppleCode(
  code: string,
  env: AppleClientEnv,
  fetchImpl: Fetch = fetch,
  timeoutMs = APPLE_REQUEST_TIMEOUT_MS,
): Promise<AppleCodeExchange> {
  const client = appleAppClient(env);
  if (!client) return { ok: false, reason: "not_configured" };
  let res: Response;
  try {
    const req = appleCodeExchangeRequest(client, code);
    res = await fetchImpl(req.url, { ...req.init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    console.warn(`auth.apple_code_exchange_failed client=${client.clientId} status=unreachable`);
    return { ok: false, reason: "unreachable" };
  }
  const body: unknown = await res.json().catch(() => null);
  const tokens = res.ok ? parseAppleTokenResponse(body) : null;
  const subject = unverifiedJwtClaims(tokens?.idToken)?.["sub"];
  if (!tokens || typeof subject !== "string") {
    console.warn(`auth.apple_code_exchange_failed client=${client.clientId} status=${res.status}`);
    return { ok: false, reason: "refused" };
  }
  return { ok: true, subject, tokens };
}
