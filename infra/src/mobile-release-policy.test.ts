import { describe, expect, it } from "vitest";

import { productionSafe, publisherRole, releasePlan } from "./mobile-release-policy.ts";

describe("mobile OTA fingerprint policy", () => {
  it("allows equal or unknown fingerprints", () => {
    expect(productionSafe("same", "same", null)).toBe(true);
    expect(productionSafe(null, "head", null)).toBe(true);
    expect(productionSafe("base", null, null)).toBe(true);
  });
  it("allows changes with only non-native reasons", () => {
    expect(
      productionSafe("base", "head", [
        { op: "added", addedSource: { reasons: ["packageJson:scripts"] } },
      ]),
    ).toBe(true);
  });
  it.each([
    "bareNativeDir",
    "rncoreAutolinkingAndroid",
    "rncoreAutolinkingIos",
    "expoAutolinkingIos",
    "expoAutolinkingAndroid",
    "expoConfigPlugins",
  ])("blocks %s on additions, removals and both sides of changes", (reason) => {
    const native = { reasons: [reason] };
    const harmless = { reasons: ["packageJson:scripts"] };
    for (const item of [
      { op: "added", addedSource: native },
      { op: "removed", removedSource: native },
      { op: "changed", beforeSource: native, afterSource: harmless },
      { op: "changed", beforeSource: harmless, afterSource: native },
    ])
      expect(productionSafe("base", "head", [item])).toBe(false);
  });
  it.each([
    null,
    {},
    [{ op: "added", addedSource: {} }],
    [{ op: "removed", removedSource: { reasons: "expoConfigPlugins" } }],
    [{ op: "unexpected" }],
  ])("fails closed on malformed classification input (%#)", (diff) => {
    expect(() => productionSafe("base", "head", diff)).toThrow();
  });
});

describe("mobile release preflight", () => {
  it("requires a publisher role in the right account", () => {
    expect(publisherRole("fixture robot\nAccounts:\n• hardmax (Role: Developer)\n")).toBe(
      "Developer",
    );
    expect(() => publisherRole("• hardmax (Role: Viewer)")).toThrow(/Developer/);
    expect(() => publisherRole("• another-account (Role: Owner)")).toThrow();
    expect(() => publisherRole("• hardmax (Role: Custom)")).toThrow();
  });
  const valid = {
    profile: "production",
    platform: "all",
    version: "1.0.0",
    appVersion: "1.0.0",
    autoSubmit: true,
  };
  it("builds the exact non-interactive, waited command before tagging", () => {
    expect(releasePlan(valid)).toEqual({
      tag: "mobile/v1.0.0",
      args: [
        "build",
        "--profile",
        "production",
        "--platform",
        "all",
        "--non-interactive",
        "--wait",
        "--auto-submit",
      ],
    });
  });
  it.each([
    { version: "1.0.1" },
    { version: "1.0.0;echo bad" },
    { platform: "web" },
    { profile: "development" },
    { profile: "preview" },
  ])("rejects invalid release inputs (%#)", (change) => {
    expect(() => releasePlan({ ...valid, ...change })).toThrow();
  });
});
