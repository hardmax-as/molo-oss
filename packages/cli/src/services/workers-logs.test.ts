import { describe, expect, it } from "vitest";

import {
  filtersFor,
  formatGroups,
  groupEvents,
  needsSecondPass,
  parseTime,
  queryBody,
  requestIdFilter,
  statusFilters,
  stripQuery,
  workerName,
  type RawEvent,
} from "./workers-logs.ts";

const NOW = Date.parse("2026-09-25T06:00:00Z");
const base = { service: "molo-api-prod", from: NOW - 3_600_000, to: NOW, limit: 100 };

describe("workerName", () => {
  it("matches the Alchemy script names", () => {
    expect(workerName("api", "prod")).toBe("molo-api-prod");
    expect(workerName("web", "preview")).toBe("molo-web-preview");
  });
});

describe("parseTime", () => {
  it("reads durations back from now", () => {
    expect(parseTime("1h", NOW)).toBe(NOW - 3_600_000);
    expect(parseTime("30m", NOW)).toBe(NOW - 1_800_000);
    expect(parseTime("2d", NOW)).toBe(NOW - 172_800_000);
    expect(parseTime("90s", NOW)).toBe(NOW - 90_000);
  });
  it("reads dates and rejects nonsense", () => {
    expect(parseTime("2026-09-25T04:00:00Z", NOW)).toBe(Date.parse("2026-09-25T04:00:00Z"));
    expect(() => parseTime("yesterday-ish", NOW)).toThrow(/duration/);
  });
});

describe("filter mapping", () => {
  it("always scopes to the service", () => {
    expect(filtersFor(base)).toEqual([
      { key: "$metadata.service", operation: "eq", type: "string", value: "molo-api-prod" },
    ]);
    expect(needsSecondPass(base)).toBe(false);
  });

  it("maps status codes and classes to numeric filters", () => {
    expect(statusFilters("500")).toEqual([
      { key: "$workers.event.response.status", operation: "eq", type: "number", value: 500 },
    ]);
    expect(statusFilters("5xx")).toEqual([
      { key: "$workers.event.response.status", operation: "gte", type: "number", value: 500 },
      { key: "$workers.event.response.status", operation: "lt", type: "number", value: 600 },
    ]);
    expect(statusFilters("4XX")[0]?.value).toBe(400);
    expect(() => statusFilters("oops")).toThrow(/--status/);
    expect(() => statusFilters("700")).toThrow();
  });

  it("maps grep and level, and asks for the second pass", () => {
    const o = { ...base, grep: "/api/auth/", level: "warn" as const };
    expect(filtersFor(o).slice(1)).toEqual([
      { key: "$metadata.message", operation: "includes", type: "string", value: "/api/auth/" },
      { key: "$metadata.level", operation: "in", type: "string", value: "warn,error" },
    ]);
    expect(filtersFor({ ...base, level: "error" }).at(-1)).toEqual({
      key: "$metadata.level",
      operation: "eq",
      type: "string",
      value: "error",
    });
    expect(needsSecondPass(o)).toBe(true);
  });

  it("joins request ids with commas, which is what the API's `in` accepts", () => {
    expect(requestIdFilter("molo-api-prod", ["a", "b"])[1]).toEqual({
      key: "$metadata.requestId",
      operation: "in",
      type: "string",
      value: "a,b",
    });
  });
});

describe("queryBody", () => {
  it("builds the adhoc events query", () => {
    const f = filtersFor(base);
    expect(queryBody(f, { from: 1, to: 2 }, 50)).toEqual({
      queryId: "adhoc",
      timeframe: { from: 1, to: 2 },
      view: "events",
      limit: 50,
      parameters: { filters: f },
    });
  });
});

const request: RawEvent = {
  timestamp: Date.parse("2026-09-25T04:59:17.229Z"),
  $metadata: {
    id: "r1",
    requestId: "req-1",
    type: "cf-worker-event",
    level: "info",
    message: "GET https://api.hellomolo.com/api/auth/callback/google?code=secret&state=x",
  },
  $workers: {
    outcome: "ok",
    wallTimeMs: 269,
    event: {
      request: {
        method: "GET",
        url: "https://api.hellomolo.com/api/auth/callback/google?code=secret&state=x",
      },
      response: { status: 302 },
    },
  },
};
const log: RawEvent = {
  timestamp: Date.parse("2026-09-25T04:59:17.228Z"),
  $metadata: {
    id: "l1",
    requestId: "req-1",
    type: "cf-worker",
    level: "error",
    message: "ERROR [Better Auth]: signup_disabled at https://x.test/cb?token=abc",
    error: "ERROR [Better Auth]: signup_disabled at https://x.test/cb?token=abc",
  },
};
const other: RawEvent = {
  timestamp: Date.parse("2026-09-25T04:00:48.009Z"),
  $metadata: { id: "r2", requestId: "req-2", type: "cf-worker-event", message: "GET /x" },
  $workers: {
    event: {
      request: { method: "GET", url: "https://api.hellomolo.com/api/auth/session" },
      response: { status: 404 },
    },
  },
};

describe("stripQuery", () => {
  it("drops query strings and fragments from URLs in free text", () => {
    expect(stripQuery("see https://a.test/p?token=1&x=2 and https://b.test/q#frag")).toBe(
      "see https://a.test/p and https://b.test/q",
    );
    expect(stripQuery("no url here")).toBe("no url here");
  });
});

describe("groupEvents and formatGroups", () => {
  it("groups console lines under their request, dedupes, and strips query strings", () => {
    const groups = groupEvents([request, log, other, log]);
    expect(groups.map((g) => g.requestId)).toEqual(["req-2", "req-1"]);
    const g = groups[1]!;
    expect(g).toMatchObject({ method: "GET", path: "/api/auth/callback/google", status: 302 });
    expect(g.logs).toHaveLength(1);
    expect(JSON.stringify(groups)).not.toContain("secret");
    expect(JSON.stringify(groups)).not.toContain("token=abc");
  });

  it("prints one line per request with indented logs", () => {
    expect(formatGroups(groupEvents([request, log, other]))).toEqual([
      "2026-09-25T04:00:48.009Z  404  GET /api/auth/session",
      "2026-09-25T04:59:17.228Z  302  GET /api/auth/callback/google  269ms",
      "    error ERROR [Better Auth]: signup_disabled at https://x.test/cb",
    ]);
  });

  it("falls back to the trigger when the request event is outside the window", () => {
    const orphan: RawEvent = {
      timestamp: 0,
      $metadata: {
        requestId: "q",
        type: "cf-worker",
        level: "log",
        message: "hi",
        trigger: "POST /v1/sync?k=1",
      },
    };
    const [g] = groupEvents([orphan]);
    expect(g).toMatchObject({ method: "POST", path: "/v1/sync", status: null });
  });
});
