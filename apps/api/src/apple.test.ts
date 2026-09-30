import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeAppleCode, revokeAppleTokens, type Fetch } from "./apple.ts";

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const jwt = (claims: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify(claims))}.sig`;

const ENV = {
  APPLE_CLIENT_ID: "com.example.web",
  APPLE_CLIENT_SECRET: "web-secret-value",
  APPLE_APP_BUNDLE_IDENTIFIER: "com.example.app",
  APPLE_APP_CLIENT_SECRET: "app-secret-value",
};

type Call = { url: string; form: Record<string, string>; signal: AbortSignal | null | undefined };

function recorder(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl: Fetch = async (url, init) => {
    const call = {
      url,
      form: Object.fromEntries(new URLSearchParams(String(init.body))),
      signal: init.signal,
    };
    calls.push(call);
    return answer(call);
  };
  return { calls, fetchImpl };
}

let warn: ReturnType<typeof vi.spyOn>;
afterEach(() => vi.restoreAllMocks());
const lines = () => warn.mock.calls.map((c: unknown[]) => c.join(" "));

describe("revokeAppleTokens", () => {
  it("revokes the refresh token with every configured client, under a deadline", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls, fetchImpl } = recorder((c) =>
      c.form["client_id"] === "com.example.app"
        ? new Response(null, { status: 200 })
        : new Response('{"error":"invalid_client"}', { status: 400 }),
    );
    const out = await revokeAppleTokens(
      [{ refreshToken: "rt-1", accessToken: "at-1", idToken: jwt({ aud: "com.example.app" }) }],
      ENV,
      fetchImpl,
    );
    expect(out).toMatchObject({ revoked: 1, failed: 0, skipped: 0 });
    expect(calls.map((c) => c.url)).toEqual([
      "https://appleid.apple.com/auth/revoke",
      "https://appleid.apple.com/auth/revoke",
    ]);
    expect(calls[0]!.form).toEqual({
      client_id: "com.example.app",
      client_secret: "app-secret-value",
      token: "rt-1",
      token_type_hint: "refresh_token",
    });
    expect(calls.every((c) => c.signal instanceof AbortSignal)).toBe(true);
    expect(lines()).toEqual([]);
  });

  it("never throws when Apple is unreachable, and logs no token or secret", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchImpl } = recorder(() => Promise.reject(new TypeError("fetch failed")));
    const out = await revokeAppleTokens(
      [{ refreshToken: "rt-secret-token", accessToken: null, idToken: null }],
      ENV,
      fetchImpl,
    );
    expect(out).toMatchObject({ revoked: 0, failed: 1, skipped: 0 });
    const logged = lines().join("\n");
    expect(logged).toContain("auth.apple_revoke_failed client=com.example.web status=network");
    expect(logged).not.toContain("rt-secret-token");
    expect(logged).not.toContain("secret-value");
  });

  it("gives up at the deadline", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hang: Fetch = (_url, init) =>
      new Promise((_, reject) =>
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
      );
    const out = await revokeAppleTokens(
      [{ refreshToken: "rt", accessToken: null, idToken: null }],
      { APPLE_CLIENT_ID: "com.example.web", APPLE_CLIENT_SECRET: "s" },
      hang,
      20,
    );
    expect(out.failed).toBe(1);
    expect(lines().join("\n")).toContain("status=timeout");
  });

  it("skips rows without a token, and a token with no client configured", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls, fetchImpl } = recorder(() => new Response(null, { status: 200 }));
    const out = await revokeAppleTokens(
      [
        { refreshToken: null, accessToken: null, idToken: jwt({ aud: "com.example.app" }) },
        { refreshToken: "rt", accessToken: null, idToken: null },
      ],
      {},
      fetchImpl,
    );
    expect(out).toMatchObject({ revoked: 0, failed: 0, skipped: 2 });
    expect(calls).toHaveLength(0);
    expect(lines().join("\n")).toContain("auth.apple_revoke_skipped reason=no_token");
  });
});

describe("exchangeAppleCode", () => {
  it("exchanges the code with the bundle id and reads the subject", async () => {
    const { calls, fetchImpl } = recorder(() =>
      Response.json({
        access_token: "at",
        refresh_token: "rt",
        id_token: jwt({ sub: "001234.abc", aud: "com.example.app" }),
        expires_in: 3600,
      }),
    );
    const out = await exchangeAppleCode("code-1", ENV, fetchImpl);
    expect(out).toMatchObject({ ok: true, subject: "001234.abc", tokens: { refreshToken: "rt" } });
    expect(calls[0]!.url).toBe("https://appleid.apple.com/auth/token");
    expect(calls[0]!.form).toMatchObject({
      client_id: "com.example.app",
      client_secret: "app-secret-value",
      code: "code-1",
      grant_type: "authorization_code",
    });
  });

  it("does nothing without the app's client secret, and reports refusals", async () => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls, fetchImpl } = recorder(() =>
      Response.json({ error: "invalid_grant" }, { status: 400 }),
    );
    expect(
      await exchangeAppleCode("c", { ...ENV, APPLE_APP_CLIENT_SECRET: undefined }, fetchImpl),
    ).toEqual({ ok: false, reason: "not_configured" });
    expect(calls).toHaveLength(0);
    expect(await exchangeAppleCode("code-2", ENV, fetchImpl)).toEqual({
      ok: false,
      reason: "refused",
    });
    expect(lines().join("\n")).not.toContain("code-2");
  });
});
