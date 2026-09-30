import { describe, expect, it } from "vitest";

import { maskQuery, toActivity, toSlow } from "./pg-stats.ts";

describe("maskQuery", () => {
  it("masks string and numeric literals but keeps placeholders and identifiers", () => {
    expect(
      maskQuery(`select * from "user" where email = 'a@b.test' and t1.age > 42 and id = $1`),
    ).toBe(`select * from "user" where email = ? and t1.age > ? and id = $1`);
  });

  it("masks escaped quotes, E-strings, dollar quotes and literals after punctuation", () => {
    expect(maskQuery(`select ('it''s', E'x\\n', $$body 123$$, $t$ tagged $t$, -1.5e3)`)).toBe(
      "select (?, ?, ?, ?, ?)",
    );
  });

  it("masks an unterminated literal and masks before it truncates", () => {
    expect(maskQuery("select 'secret-token-that-was-cut")).toBe("select ?");
    const long = `update t set v = '${"x".repeat(200)}' where k = 7`;
    const out = maskQuery(long, 40);
    expect(out).toBe("update t set v = ? where k = ?");
    expect(maskQuery(`select ${"a, ".repeat(100)}b`, 20)).toHaveLength(20);
  });

  it("collapses whitespace", () => {
    expect(maskQuery("select\n   1\n\tfrom x")).toBe("select ? from x");
  });
});

describe("row mapping", () => {
  it("rounds seconds and masks activity queries", () => {
    const [r] = toActivity([
      {
        pid: 7,
        backend_type: "client backend",
        application: "postgres.js",
        state: "active",
        wait_event: "",
        query_seconds: 1.234,
        xact_seconds: null,
        query: "select 1 where x = 'y'",
      },
    ]);
    expect(r).toEqual({
      pid: 7,
      backend: "client backend",
      application: "postgres.js",
      state: "active",
      waitEvent: "",
      querySeconds: 1.2,
      xactSeconds: null,
      query: "select ? where x = ?",
    });
  });

  it("maps pg_stat_statements rows", () => {
    expect(
      toSlow([
        { calls: "3", total_ms: 10.5, mean_ms: 3.5, max_ms: 6, rows: "9", query: "select $1" },
      ]),
    ).toEqual([{ calls: 3, totalMs: 10.5, meanMs: 3.5, maxMs: 6, rows: 9, query: "select $1" }]);
  });
});
