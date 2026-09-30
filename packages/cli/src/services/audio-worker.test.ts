import { describe, expect, it } from "vitest";

import { actorRefFor, UPLOADER, visibilityMsFor } from "../services/audio-worker.ts";

describe("audio worker attribution", () => {
  it("attributes to the uploading editor by default", () => {
    expect(actorRefFor(UPLOADER, "user_tutor")).toBe("user_tutor");
  });

  it("attributes to an explicit account when one is given", () => {
    expect(actorRefFor("ops@example.test", "user_tutor")).toBe("ops@example.test");
  });
});

describe("visibility timeout", () => {
  it("gives each recording two minutes, within Cloudflare's bounds", () => {
    expect(visibilityMsFor(1)).toBe(5 * 60_000);
    expect(visibilityMsFor(20)).toBe(40 * 60_000);
    expect(visibilityMsFor(1000)).toBe(12 * 3_600_000);
  });
});
