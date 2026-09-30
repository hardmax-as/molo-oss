import { describe, expect, it } from "vitest";

import {
  appleSecretClaims,
  appleSecretDaysLeft,
  base64url,
  decodeAppleSecretExpiry,
  makeAppleClientSecret,
  pemToDer,
  upsertDotenv,
} from "./apple-secret.ts";

async function testKeyPem(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
  return {
    pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`,
    publicKey: pair.publicKey,
  };
}

describe("apple client secret", () => {
  it("signs an ES256 JWT that verifies and carries Apple's claims", async () => {
    const { pem, publicKey } = await testKeyPem();
    const now = new Date("2026-09-20T12:00:00Z");
    const jwt = await makeAppleClientSecret({
      pem,
      keyId: "ABC123DEF4",
      teamId: "QS22KUQ4QT",
      clientId: "com.hardmax.molo.web",
      days: 180,
      now,
    });
    const [h, p, s] = jwt.split(".") as [string, string, string];
    const decode = (x: string) =>
      JSON.parse(atob(x.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    expect(decode(h)).toEqual({ alg: "ES256", kid: "ABC123DEF4" });
    expect(decode(p)).toEqual({
      iss: "QS22KUQ4QT",
      iat: 1789905600,
      exp: 1789905600 + 180 * 86_400,
      aud: "https://appleid.apple.com",
      sub: "com.hardmax.molo.web",
    });
    expect(decodeAppleSecretExpiry(jwt)).toBe(1789905600 + 180 * 86_400);
    expect(appleSecretDaysLeft(jwt, now)).toBe(180);
    const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    expect(sig.length).toBe(64);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      sig,
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(ok).toBe(true);
  });

  it("refuses a validity Apple would reject", () => {
    const base = { keyId: "ABC123DEF4", teamId: "QS22KUQ4QT", clientId: "x" };
    expect(() => appleSecretClaims({ ...base, days: 181 })).toThrow(/180/);
    expect(() => appleSecretClaims({ ...base, days: 0 })).toThrow(/180/);
    expect(() => appleSecretClaims({ ...base, keyId: "short", days: 1 })).toThrow(/key id/);
  });

  it("reads PEM with any line endings and rejects an empty file", () => {
    expect(
      pemToDer("-----BEGIN PRIVATE KEY-----\r\nAQID\r\n-----END PRIVATE KEY-----\r\n"),
    ).toEqual(new Uint8Array([1, 2, 3]));
    expect(() => pemToDer("-----BEGIN PRIVATE KEY-----\n-----END PRIVATE KEY-----\n")).toThrow(
      /empty/,
    );
  });

  it("base64url has no padding or url-unsafe characters", () => {
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe("-__-");
    expect(base64url("a")).toBe("YQ");
  });

  it("upserts dotenv lines without touching the rest", () => {
    const body = "A=1\n# comment\nAPPLE_CLIENT_ID=old\nB='2'\n";
    const next = upsertDotenv(body, { APPLE_CLIENT_ID: "com.x", APPLE_CLIENT_SECRET: "j.w.t" });
    expect(next).toBe(
      "A=1\n# comment\nAPPLE_CLIENT_ID='com.x'\nB='2'\nAPPLE_CLIENT_SECRET='j.w.t'\n",
    );
    expect(upsertDotenv("", { K: "v" })).toBe("K='v'\n");
  });
});

describe("Apple secret expiry checks", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const jwtWith = (claims: unknown): string =>
    `${base64url('{"alg":"ES256"}')}.${base64url(JSON.stringify(claims))}.${base64url("test signature")}`;

  it("decodes unpadded base64url and UTF-8 without a signing key", () => {
    // The Unicode text makes the payload exercise both URL-safe characters.
    const jwt = jwtWith({ exp: 1792497600, note: "a\u083e\u083f" });
    expect(jwt.split(".")[1]).toMatch(/-/);
    expect(jwt.split(".")[1]).toMatch(/_/);
    expect(decodeAppleSecretExpiry(jwt)).toBe(1792497600);
  });

  it.each([
    [180 * 86_400, 180, false],
    [30 * 86_400, 30, false],
    [30 * 86_400 - 1, 29, true],
    [1, 0, true],
    [0, 0, true],
    [-1, -1, true],
    [-31 * 86_400, -31, true],
  ])("reports %i seconds remaining as %i days", (seconds, days, fails) => {
    const jwt = jwtWith({ exp: now.getTime() / 1000 + seconds });
    const remaining = appleSecretDaysLeft(jwt, now);
    expect(remaining).toBe(days);
    expect(remaining < 30).toBe(fails);
  });

  it.each([{}, null, [], { exp: "1792497600" }, { exp: 1.5 }, { exp: -1 }, { exp: 1e20 }])(
    "rejects a missing or invalid expiry: %j",
    (claims) => {
      expect(() => decodeAppleSecretExpiry(jwtWith(claims))).toThrow(/valid numeric exp/);
    },
  );

  it.each(["", "not-a-jwt", "e30.e30", "e30.e30.sig.extra", "e30.!bad.sig", "e30.a.sig"])(
    "rejects malformed JWTs without echoing input (%#)",
    (jwt) => {
      expect(() => decodeAppleSecretExpiry(jwt)).toThrow(
        "APPLE_CLIENT_SECRET must be a JWT with a valid numeric exp claim",
      );
    },
  );

  it("hides JSON parser input in errors", () => {
    const jwt = `e30.${base64url("sensitive malformed payload")}.sig`;
    expect(() => decodeAppleSecretExpiry(jwt)).toThrow(
      "APPLE_CLIENT_SECRET must be a JWT with a valid numeric exp claim",
    );
  });
});
