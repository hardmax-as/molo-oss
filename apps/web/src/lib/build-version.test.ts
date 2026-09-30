import { describe, expect, it } from "vitest";

import { isNewerBuild, servedBuild } from "./build-version.ts";

describe("new build detection", () => {
  it("reads the build id from /build.json, and nothing else", () => {
    expect(servedBuild({ build: " abc123 " })).toBe("abc123");
    expect(servedBuild({ build: "" })).toBeNull();
    expect(servedBuild({ build: 42 })).toBeNull();
    expect(servedBuild("abc")).toBeNull();
    expect(servedBuild(null)).toBeNull();
  });

  it("says newer only for a different id, never for a missing one", () => {
    expect(isNewerBuild("a", "b")).toBe(true);
    expect(isNewerBuild("a", "a")).toBe(false);
    // A dev server has no /build.json; a failed fetch is not a new version.
    expect(isNewerBuild("a", null)).toBe(false);
    expect(isNewerBuild("", "b")).toBe(false);
  });
});
