/**
 * The two decisions the content cache makes, held to what docs/CACHING.md
 * promises: a key that changes exactly when published content changes, and
 * a rule that lets published content be shared and nothing else.
 */

import { describe, expect, it } from "vitest";

import {
  contentCacheKey,
  decideCache,
  PRIVATE_CACHE_CONTROL,
  PUBLIC_CACHE_CONTROL,
  versionTokenOf,
} from "./content-cache.ts";

const ORIGIN = "https://api.molo.example";

describe("the content version token", () => {
  it("changes when a revision is written", () => {
    const before = versionTokenOf({
      revisions: 12,
      latestAt: "2026-09-05T10:00:00.000Z",
      defaultCourseId: "c",
    });
    const after = versionTokenOf({
      revisions: 13,
      latestAt: "2026-09-05T10:00:01.000Z",
      defaultCourseId: "c",
    });
    expect(after).not.toBe(before);
  });

  it("is stable while nothing is published", () => {
    const v = { revisions: 12, latestAt: "2026-09-05T10:00:00.000Z", defaultCourseId: "c" };
    expect(versionTokenOf(v)).toBe(versionTokenOf({ ...v }));
  });

  it("moves on the count alone, so two edits in one millisecond still separate", () => {
    const at = "2026-09-05T10:00:00.000Z";
    expect(versionTokenOf({ revisions: 1, latestAt: at, defaultCourseId: null })).not.toBe(
      versionTokenOf({ revisions: 2, latestAt: at, defaultCourseId: null }),
    );
  });

  it("moves on the timestamp alone, so a restore to the same count still separates", () => {
    expect(
      versionTokenOf({ revisions: 9, latestAt: "2026-09-05T10:00:00.000Z", defaultCourseId: null }),
    ).not.toBe(
      versionTokenOf({ revisions: 9, latestAt: "2026-09-05T11:00:00.000Z", defaultCourseId: null }),
    );
  });

  it("survives an empty table and an unparseable timestamp without throwing", () => {
    expect(versionTokenOf({ revisions: 0, latestAt: null, defaultCourseId: null })).toBe("0-0");
    expect(versionTokenOf({ revisions: 3, latestAt: "not a date", defaultCourseId: null })).toBe(
      "3-0",
    );
  });
});

describe("the cache key", () => {
  const base = {
    version: "7-1757066400000",
    route: "unit",
    courseId: "course-1",
    lang: "en",
    params: { slug: "greetings" },
  } as const;

  it("separates two versions, which is the whole invalidation strategy", () => {
    expect(contentCacheKey(ORIGIN, base)).not.toBe(
      contentCacheKey(ORIGIN, { ...base, version: "8-1757066460000" }),
    );
  });

  it("separates the interface languages, because the glosses differ", () => {
    expect(contentCacheKey(ORIGIN, base)).not.toBe(
      contentCacheKey(ORIGIN, { ...base, lang: "nb" }),
    );
  });

  it("separates the courses, so one curriculum cannot answer for another", () => {
    expect(contentCacheKey(ORIGIN, base)).not.toBe(
      contentCacheKey(ORIGIN, { ...base, courseId: "course-2" }),
    );
  });

  it("separates the routes and the route's own parameters", () => {
    expect(contentCacheKey(ORIGIN, base)).not.toBe(
      contentCacheKey(ORIGIN, { ...base, route: "units", params: {} }),
    );
    expect(contentCacheKey(ORIGIN, base)).not.toBe(
      contentCacheKey(ORIGIN, { ...base, params: { slug: "clicks" } }),
    );
  });

  it("is the same key whatever order the facts arrive in", () => {
    const a = contentCacheKey(ORIGIN, base);
    const b = contentCacheKey(ORIGIN, {
      params: { slug: "greetings" },
      lang: "en",
      courseId: "course-1",
      route: "unit",
      version: "7-1757066400000",
    });
    expect(a).toBe(b);
  });

  it("stays on the Worker's own origin, which Cloudflare's cache requires", () => {
    expect(contentCacheKey(ORIGIN, base).startsWith(`${ORIGIN}/__content/`)).toBe(true);
  });

  it("names no learner, ever", () => {
    expect(contentCacheKey(ORIGIN, base)).not.toMatch(/user|session|actor|cookie/i);
  });
});

describe("what may be cached", () => {
  const guest = (path: string) => decideCache({ method: "GET", path, signedIn: false });
  const learner = (path: string) => decideCache({ method: "GET", path, signedIn: true });

  it("caches the units list, a unit and the path for a request with no session", () => {
    for (const [path, route] of [
      ["/units", "units"],
      ["/units/greetings", "unit"],
      ["/path", "path"],
    ] as const) {
      const d = guest(path);
      expect(d.cache).toBe(true);
      expect(d.cache && d.route).toBe(route);
      expect(d.cacheControl).toBe(PUBLIC_CACHE_CONTROL);
    }
  });

  it("never caches a response built for a signed-in learner", () => {
    for (const path of ["/units", "/units/greetings", "/path"]) {
      const d = learner(path);
      expect(d.cache).toBe(false);
      expect(d.cache === false && d.why).toBe("has_a_session");
      expect(d.cacheControl).toBe(PRIVATE_CACHE_CONTROL);
    }
  });

  it("never caches learner state, whoever asks", () => {
    for (const path of [
      "/me",
      "/me/progress",
      "/me/hearts",
      "/me/mistakes",
      "/me/export",
      "/review/session",
      "/leagues/current",
      "/leagues/history",
      // A unit's crown is the learner's own mastery, and it sits under a
      // path that looks like the cacheable one.
      "/units/greetings/crown",
    ]) {
      const d = guest(path);
      expect(d.cache).toBe(false);
      expect(d.cacheControl).toBe(PRIVATE_CACHE_CONTROL);
    }
  });

  it("never caches an editor route, which is the whole publish gate", () => {
    for (const path of [
      "/edit",
      "/edit/overview",
      "/edit/lexemes",
      "/edit/lexemes/abc",
      "/edit/sentences",
      "/edit/curriculum",
      "/edit/review",
    ]) {
      const d = guest(path);
      expect(d.cache).toBe(false);
      expect(d.cache === false && d.why).toBe("editor_route");
    }
  });

  it("never caches anything that is not a GET", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      const d = decideCache({ method, path: "/units", signedIn: false });
      expect(d.cache).toBe(false);
      expect(d.cache === false && d.why).toBe("not_a_get");
    }
  });

  it("refuses anything it was not explicitly told about", () => {
    for (const path of [
      "/",
      "/welcome",
      "/courses",
      "/health",
      "/audio/abc.opus",
      "/api/auth/ok",
    ]) {
      const d = guest(path);
      expect(d.cache).toBe(false);
      expect(d.cache === false && d.why).toBe("not_published_content");
    }
  });
});
