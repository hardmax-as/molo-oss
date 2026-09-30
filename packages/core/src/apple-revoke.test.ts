import { describe, expect, it } from "vitest";

import {
  agePendingCutoff,
  appleClients,
  appleCodeExchangeRequest,
  appleRevokeRequest,
  parseAppleTokenResponse,
  planAppleRevocations,
  unverifiedJwtClaims,
} from "./apple-revoke.ts";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** base64url of ASCII text, in plain ECMAScript like the module under test. */
const b64url = (s: string) => {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const ch of s) {
    value = (value << 8) | ch.charCodeAt(0);
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64[(value >> bits) & 63];
    }
  }
  return bits > 0 ? out + B64[(value << (6 - bits)) & 63] : out;
};
const formOf = (body: string) =>
  Object.fromEntries(
    body.split("&").map((kv) => kv.split("=").map(decodeURIComponent) as [string, string]),
  );
const jwt = (claims: Record<string, unknown>) =>
  `${b64url(JSON.stringify({ alg: "none" }))}.${b64url(JSON.stringify(claims))}.sig`;

const ENV = {
  APPLE_CLIENT_ID: "com.example.web",
  APPLE_CLIENT_SECRET: "web-secret",
  APPLE_APP_BUNDLE_IDENTIFIER: "com.example.app",
  APPLE_APP_CLIENT_SECRET: "app-secret",
};

describe("appleClients", () => {
  it("offers a client only when both its id and secret exist", () => {
    expect(appleClients(ENV).map((c) => c.clientId)).toEqual([
      "com.example.web",
      "com.example.app",
    ]);
    expect(appleClients({ ...ENV, APPLE_APP_CLIENT_SECRET: undefined })).toHaveLength(1);
    expect(appleClients({})).toEqual([]);
  });
});

describe("planAppleRevocations", () => {
  const clients = appleClients(ENV);

  it("prefers the refresh token and asks the id token's audience first", () => {
    const plan = planAppleRevocations(
      [{ refreshToken: "r1", accessToken: "a1", idToken: jwt({ aud: "com.example.app" }) }],
      clients,
    );
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]!.map((r) => [r.client.clientId, r.token, r.tokenTypeHint])).toEqual([
      ["com.example.app", "r1", "refresh_token"],
      ["com.example.web", "r1", "refresh_token"],
    ]);
  });

  it("falls back to the access token, and counts rows it cannot revoke", () => {
    const plan = planAppleRevocations(
      [
        { refreshToken: null, accessToken: "a2", idToken: null },
        { refreshToken: null, accessToken: null, idToken: jwt({ aud: "com.example.app" }) },
      ],
      clients,
    );
    expect(plan.groups[0]![0]).toMatchObject({ token: "a2", tokenTypeHint: "access_token" });
    expect(plan.withoutToken).toBe(1);
    expect(
      planAppleRevocations([{ refreshToken: "r", accessToken: null, idToken: null }], []),
    ).toMatchObject({ groups: [], withoutClient: 1 });
  });
});

describe("request builders", () => {
  it("builds Apple's revoke form", () => {
    const [client] = appleClients(ENV);
    const req = appleRevokeRequest({ client: client!, token: "t", tokenTypeHint: "refresh_token" });
    expect(req.url).toBe("https://appleid.apple.com/auth/revoke");
    expect(formOf(req.init.body)).toEqual({
      client_id: "com.example.web",
      client_secret: "web-secret",
      token: "t",
      token_type_hint: "refresh_token",
    });
  });

  it("builds the code exchange without a redirect uri", () => {
    const req = appleCodeExchangeRequest({ clientId: "com.example.app", clientSecret: "s" }, "c");
    expect(req.url).toBe("https://appleid.apple.com/auth/token");
    expect(formOf(req.init.body)).toEqual({
      client_id: "com.example.app",
      client_secret: "s",
      code: "c",
      grant_type: "authorization_code",
    });
  });

  it("reads Apple's token response, refusing one without a refresh token", () => {
    expect(
      parseAppleTokenResponse({
        refresh_token: "r",
        access_token: "a",
        id_token: "i",
        expires_in: 3600,
      }),
    ).toEqual({ refreshToken: "r", accessToken: "a", idToken: "i", expiresIn: 3600 });
    expect(parseAppleTokenResponse({ access_token: "a" })).toBeNull();
    expect(parseAppleTokenResponse("nope")).toBeNull();
  });
});

describe("unverifiedJwtClaims", () => {
  it("decodes claims and rejects anything that is not a JWT", () => {
    expect(unverifiedJwtClaims(jwt({ sub: "001", aud: "x" }))).toEqual({ sub: "001", aud: "x" });
    // UTF-8 payload, no padding: {"n":"Æ"}
    expect(unverifiedJwtClaims("x.eyJuIjoiw4YifQ.y")).toEqual({ n: "Æ" });
    expect(unverifiedJwtClaims("not-a-jwt")).toBeNull();
    expect(unverifiedJwtClaims("a.@@@.c")).toBeNull();
    expect(unverifiedJwtClaims(null)).toBeNull();
  });
});

describe("agePendingCutoff", () => {
  it("is seven days before now", () => {
    expect(agePendingCutoff(new Date("2026-09-25T12:00:00Z")).toISOString()).toBe(
      "2026-09-18T12:00:00.000Z",
    );
  });
});
