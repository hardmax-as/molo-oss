import { afterEach, describe, expect, it } from "vitest";

import {
  forbiddenMessage,
  issuesWindow,
  SENTRY_PROJECTS,
  seenSince,
  sentryConfig,
  summariseEvent,
  type SentryEvent,
} from "./sentry.ts";

describe("issuesWindow", () => {
  const now = Date.parse("2026-09-25T12:00:00Z");
  it.each([
    ["30m", "24h"],
    ["1h", "24h"],
    ["24h", "24h"],
    ["1d", "24h"],
    ["25h", "14d"],
    ["3d", "14d"],
    ["14d", "14d"],
    ["2026-09-20T00:00Z", "14d"],
  ])("asks Sentry for a period it accepts: --since %s → %s", (since, period) => {
    expect(issuesWindow(since, now).statsPeriod).toBe(period);
  });

  it("keeps the exact cutoff for client-side filtering, and says when 14 days caps it", () => {
    expect(issuesWindow("3d", now)).toEqual({
      statsPeriod: "14d",
      cutoff: now - 3 * 86_400_000,
      capped: false,
    });
    expect(issuesWindow("30d", now).capped).toBe(true);
    expect(() => issuesWindow("soon", now)).toThrow(/cannot read/);
  });

  it("filters by last seen", () => {
    const cutoff = Date.parse("2026-09-24T00:00:00Z");
    const issues = [
      { id: "old", lastSeen: "2026-09-20T00:00:00Z" },
      { id: "new", lastSeen: "2026-09-25T00:00:00Z" },
      { id: "odd", lastSeen: "not a date" },
    ];
    expect(seenSince(issues, cutoff).map((i) => i.id)).toEqual(["new", "odd"]);
  });

  it("offers the mobile project", () => {
    expect(SENTRY_PROJECTS).toContain("molo-mobile");
  });
});

const saved = { ...process.env };
afterEach(() => {
  for (const k of ["SENTRY_READ_TOKEN", "SENTRY_AUTH_TOKEN", "SENTRY_URL", "SENTRY_ORG"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("sentryConfig", () => {
  it("prefers the read token and defaults to the EU host and org", () => {
    process.env["SENTRY_READ_TOKEN"] = "read";
    process.env["SENTRY_AUTH_TOKEN"] = "ci";
    delete process.env["SENTRY_URL"];
    delete process.env["SENTRY_ORG"];
    expect(sentryConfig()).toEqual({
      host: "https://de.sentry.io",
      org: "malmo-development",
      token: "read",
      tokenVar: "SENTRY_READ_TOKEN",
    });
  });

  it("falls back to SENTRY_AUTH_TOKEN, and to nothing", () => {
    delete process.env["SENTRY_READ_TOKEN"];
    process.env["SENTRY_AUTH_TOKEN"] = "ci";
    expect(sentryConfig()?.tokenVar).toBe("SENTRY_AUTH_TOKEN");
    delete process.env["SENTRY_AUTH_TOKEN"];
    expect(sentryConfig()).toBeUndefined();
  });

  it("names the scopes a read token needs", () => {
    const m = forbiddenMessage("SENTRY_AUTH_TOKEN");
    for (const s of [
      "org:read",
      "project:read",
      "event:read",
      "SENTRY_READ_TOKEN",
      "Internal Integration",
    ])
      expect(m).toContain(s);
  });
});

describe("summariseEvent", () => {
  const event: SentryEvent = {
    eventID: "e1",
    dateCreated: "2026-09-25T04:59:17Z",
    title: "TypeError: x is undefined",
    culprit: "GET /api/me",
    tags: [
      { key: "environment", value: "prod" },
      { key: "release", value: "abc" },
      { key: "user", value: "id:123" },
      { key: "user.email", value: "a@b.test" },
      { key: "url", value: "https://api.hellomolo.com/api/me?token=t" },
    ],
    entries: [
      {
        type: "exception",
        data: {
          values: [
            { type: "Cause", value: "root" },
            {
              type: "TypeError",
              value: "x is undefined at https://a.test/p?token=t",
              stacktrace: {
                frames: [
                  { function: "lib", filename: "node_modules/hono/x.js", lineNo: 1, inApp: false },
                  { function: "outer", filename: "src/routes/me.ts", lineNo: 10, inApp: true },
                  { function: "inner", filename: "src/lib/a.ts", lineNo: 3, colNo: 7, inApp: true },
                ],
              },
            },
          ],
        },
      },
      { type: "breadcrumbs", data: { values: [{}, {}, {}] } },
      { type: "request", data: {} },
    ],
  };

  it("keeps the thrown exception, in-app frames innermost first, and non-PII tags", () => {
    const s = summariseEvent(event);
    expect(s.exception).toEqual({ type: "TypeError", value: "x is undefined at https://a.test/p" });
    expect(s.frames).toEqual(["inner (src/lib/a.ts:3:7)", "outer (src/routes/me.ts:10)"]);
    expect(s.tags).toEqual({ environment: "prod", release: "abc" });
    expect(s.breadcrumbs).toBe(3);
    expect(JSON.stringify(s)).not.toContain("a@b.test");
  });

  it("shows library frames when nothing is in-app, and survives an empty event", () => {
    const s = summariseEvent({
      entries: [
        { type: "exception", data: { values: [{ stacktrace: { frames: [{ function: "f" }] } }] } },
      ],
    });
    expect(s.frames).toEqual(["f (?)"]);
    expect(summariseEvent({})).toMatchObject({
      title: "",
      exception: null,
      frames: [],
      breadcrumbs: 0,
    });
  });
});
