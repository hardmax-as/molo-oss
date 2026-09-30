import { describe, expect, it } from "vitest";

import { publicAudioUrl, signAudioUrl, verifyAudioUrl } from "./signing.ts";

/**
 * The rule this file protects (docs/CACHING.md): a published recording has one
 * URL for all time, so an edge near the learner can hold it; an unpublished one
 * is still signed and still expires.
 */

const KEY = `audio/${"a".repeat(64)}.opus`;
const BASE = "https://api.example/audio";

describe("published audio", () => {
  it("has a stable URL with nothing in the query string", () => {
    const url = publicAudioUrl(BASE, KEY);
    expect(url).toBe(`${BASE}/audio/${"a".repeat(64)}.opus`);
    expect(url).not.toContain("?");
  });

  it("is byte-identical an hour later, which is the whole point", () => {
    expect(publicAudioUrl(BASE, KEY)).toBe(publicAudioUrl(BASE, KEY));
  });

  it("tolerates a base with a trailing slash", () => {
    expect(publicAudioUrl(`${BASE}/`, KEY)).toBe(publicAudioUrl(BASE, KEY));
  });

  it("escapes a key so a path segment cannot break out", () => {
    expect(publicAudioUrl(BASE, "audio/../secret.opus")).toContain("%2E%2E");
  });
});

describe("unpublished audio", () => {
  it("is still signed and still expires", async () => {
    const now = Date.UTC(2026, 8, 5);
    const url = await signAudioUrl("s3cret", BASE, "private", KEY, 3600, now);
    expect(url).toContain("b=private");
    expect(url).toContain("sig=");

    const q = new URL(url).searchParams;
    const fresh = await verifyAudioUrl(
      "s3cret",
      "private",
      KEY,
      q.get("exp") ?? "",
      q.get("sig") ?? "",
      now,
    );
    expect(fresh.ok).toBe(true);

    const later = await verifyAudioUrl(
      "s3cret",
      "private",
      KEY,
      q.get("exp") ?? "",
      q.get("sig") ?? "",
      now + 3601_000,
    );
    expect(later.ok).toBe(false);
  });

  it("refuses a signature made for the other bucket", async () => {
    const now = Date.UTC(2026, 8, 5);
    const url = await signAudioUrl("s3cret", BASE, "public", KEY, 3600, now);
    const q = new URL(url).searchParams;
    const v = await verifyAudioUrl(
      "s3cret",
      "private",
      KEY,
      q.get("exp") ?? "",
      q.get("sig") ?? "",
      now,
    );
    expect(v.ok).toBe(false);
  });
});
