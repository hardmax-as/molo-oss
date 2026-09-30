import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The service worker's routing rules (docs/CACHING.md section 2.2).
 *
 * `public/sw.js` is copied to the origin root byte for byte and never passes
 * through a bundler, so there is nothing to import. It is evaluated here
 * against a stub `self` instead — which is also the honest test, because it
 * asserts against the file the browser actually gets rather than against a
 * TypeScript source that resembles it.
 *
 * What is being defended: a learner's own state must never be served from a
 * cache, and an editor route must never be cached at all.
 */

const SW = fileURLToPath(new URL("../../public/sw.js", import.meta.url));

interface Policy {
  policyFor: (
    request: { method: string; mode?: string },
    url: URL,
    api: string | null,
    origin: string,
  ) => string;
  VERSION: string;
  OURS: string[];
}

function loadWorker(): Policy {
  const source = readFileSync(SW, "utf8");
  const self: Record<string, unknown> = {
    location: { href: "https://molo.example/sw.js?api=https%3A%2F%2Fapi.molo.example" },
    addEventListener: () => undefined,
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  // `caches` and `fetch` are only touched inside handlers, which this never runs.
  new Function("self", "caches", "fetch", source)(self, undefined, undefined);
  return self["__molo"] as Policy;
}

const API = "https://api.molo.example";
const WEB = "https://molo.example";

const sw = loadWorker();
const decide = (path: string, opts: { method?: string; mode?: string; base?: string } = {}) =>
  sw.policyFor(
    { method: opts.method ?? "GET", mode: opts.mode ?? "cors" },
    new URL(path, opts.base ?? API),
    API,
    WEB,
  );

describe("what the service worker keeps", () => {
  it("keeps published audio, which can never change under its own URL", () => {
    expect(decide("/audio/abc123.opus")).toBe("audio");
  });

  it("keeps the units list, a unit and the path, to be served only when the network fails", () => {
    expect(decide("/units")).toBe("data");
    expect(decide("/units/greetings")).toBe("data");
    expect(decide("/path")).toBe("data");
  });

  it("keeps the shell and the hashed assets a deploy emits", () => {
    expect(decide("/", { base: WEB, mode: "navigate" })).toBe("shell");
    expect(decide("/learn/greetings", { base: WEB, mode: "navigate" })).toBe("shell");
    expect(decide("/assets/index-a1b2c3.js", { base: WEB })).toBe("static");
    expect(decide("/favicon.svg", { base: WEB })).toBe("static");
  });
});

describe("what the service worker must never keep", () => {
  it("never keeps learner state", () => {
    for (const path of [
      "/me",
      "/me/progress",
      "/me/hearts",
      "/me/mistakes",
      "/me/export",
      "/review/session",
      "/leagues/current",
      "/leagues/history",
      // A unit's crown is this learner's own mastery, under a path that looks
      // like the one that is cacheable.
      "/units/greetings/crown",
    ]) {
      expect(decide(path), path).toBe("pass");
    }
  });

  it("never keeps an editor route, on either origin", () => {
    for (const path of ["/edit", "/edit/overview", "/edit/lexemes/abc", "/edit/review"]) {
      expect(decide(path), path).toBe("pass");
      expect(decide(path, { base: WEB, mode: "navigate" }), path).toBe("pass");
    }
  });

  it("never keeps signed, expiring editorial audio", () => {
    expect(decide("/audio/abc123.opus?b=private&exp=1&sig=2")).toBe("pass");
  });

  it("never keeps anything that is not a GET", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(decide("/units", { method }), method).toBe("pass");
      expect(decide("/", { base: WEB, mode: "navigate", method }), method).toBe("pass");
    }
  });

  it("never keeps the auth endpoints, or anything else it was not told about", () => {
    for (const path of ["/api/auth/ok", "/api/auth/sign-in/email", "/courses", "/welcome"]) {
      expect(decide(path), path).toBe("pass");
    }
  });

  it("ignores a third origin entirely", () => {
    expect(decide("/anything", { base: "https://elsewhere.example" })).toBe("pass");
  });

  it("does nothing at all when it was not told which origin the API is on", () => {
    expect(sw.policyFor({ method: "GET", mode: "cors" }, new URL("/units", API), null, WEB)).toBe(
      "pass",
    );
  });
});

describe("a deploy", () => {
  it("names every cache after the version, so activating sweeps the last one", () => {
    expect(sw.OURS.length).toBeGreaterThan(0);
    for (const name of sw.OURS) {
      expect(name.startsWith("molo-")).toBe(true);
      expect(name.endsWith(`-${sw.VERSION}`)).toBe(true);
    }
  });
});
