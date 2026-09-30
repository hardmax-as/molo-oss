import { describe, expect, it, vi } from "vitest";

import fixture from "./fixtures/ios-signing-expiry.json";
import {
  IOS_SIGNING_EXPIRY_QUERY,
  parseIosSigningExpiry,
  readIosSigningExpiry,
} from "./ios-signing-expiry.ts";

const now = new Date("2026-09-21T12:00:00Z");
const clone = () => structuredClone(fixture);

describe("EAS iOS signing expiry", () => {
  it("reads only the bundle's linked App Store certificate and profile", () => {
    expect(parseIosSigningExpiry(fixture, now)).toEqual([
      {
        name: "iOS Distribution certificate (com.hardmax.molo)",
        expiresAt: "2027-09-21T12:00:00.000Z",
        daysLeft: 365,
      },
      {
        name: "App Store provisioning profile (com.hardmax.molo)",
        expiresAt: "2026-10-21T12:00:00.000Z",
        daysLeft: 30,
      },
    ]);
  });

  it.each([
    [0, 30, false],
    [1, 29, true],
    [30 * 86_400_000, 0, true],
    [31 * 86_400_000, -1, true],
  ])("uses whole days at the 30-day boundary (%i ms later)", (later, days, fails) => {
    const result = parseIosSigningExpiry(fixture, new Date(now.getTime() + later));
    expect(result[1]!.daysLeft).toBe(days);
    expect(result.some((item) => item.daysLeft < 30)).toBe(fails);
  });

  it("also fails when the certificate, rather than the profile, expires first", () => {
    const value = clone();
    value.data.app.byFullName.iosAppCredentials[0]!.iosAppBuildCredentialsList[0]!.distributionCertificate.validityNotAfter =
      "2026-09-22T12:00:00Z";
    expect(parseIosSigningExpiry(value, now).some((item) => item.daysLeft < 30)).toBe(true);
  });

  it.each([null, {}, { errors: [{ message: "private response" }] }, { data: null }])(
    "refuses malformed responses without echoing them (%#)",
    (value) => {
      expect(() => parseIosSigningExpiry(value, now)).toThrow(
        "EAS signing expiry response is missing, ambiguous or malformed",
      );
    },
  );

  it.each(["wrong bundle", "duplicate", "no build", "ad hoc", "invalid expiry"])(
    "fails closed for %s",
    (kind) => {
      const value = clone();
      const credentials = value.data.app.byFullName.iosAppCredentials[0]!;
      if (kind === "wrong bundle") credentials.appleAppIdentifier.bundleIdentifier = "another.app";
      if (kind === "duplicate") value.data.app.byFullName.iosAppCredentials.push(credentials);
      if (kind === "no build") credentials.iosAppBuildCredentialsList = [];
      if (kind === "ad hoc")
        credentials.iosAppBuildCredentialsList[0]!.iosDistributionType = "AD_HOC";
      if (kind === "invalid expiry")
        credentials.iosAppBuildCredentialsList[0]!.provisioningProfile.expiration =
          "private malformed input";
      expect(() => parseIosSigningExpiry(value, now)).toThrow(
        "EAS signing expiry response is missing, ambiguous or malformed",
      );
    },
  );

  it("requests metadata with the existing token, never key material or identifiers", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture));
    await expect(readIosSigningExpiry("fixture-token", request, now)).resolves.toHaveLength(2);
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("https://api.expo.dev/graphql");
    expect(init?.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer fixture-token",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      query: IOS_SIGNING_EXPIRY_QUERY,
      variables: { projectFullName: "@hardmax/molo" },
    });
    expect(IOS_SIGNING_EXPIRY_QUERY).not.toMatch(
      /\b(?:id|serialNumber|developerPortalIdentifier|certificateP12|certificatePassword|certificatePrivateSigningKey|appleUUID|mutation)\b/,
    );
    expect(IOS_SIGNING_EXPIRY_QUERY).toContain("iosDistributionType: APP_STORE");
  });

  it("redacts transport and GraphQL error payloads", async () => {
    for (const request of [
      vi.fn<typeof fetch>().mockRejectedValue(new Error("fixture-token")),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ errors: [{ message: "private response" }] })),
      vi.fn<typeof fetch>().mockResolvedValue(new Response("private response", { status: 403 })),
    ]) {
      await expect(readIosSigningExpiry("fixture-token", request, now)).rejects.toThrow(
        "Could not read EAS signing expiry; check token access and App Store credentials",
      );
    }
  });
});
