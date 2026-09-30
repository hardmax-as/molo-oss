import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Db } from "@molo/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Bindings } from "./env.ts";
import { CRON, dueJobs, runCron } from "./scheduled.ts";

/**
 * A database stub: `execute` (the report's only verb) answers with no rows,
 * so the report is all zeros; anything the nightly branch does — a Drizzle
 * `select()` — throws, which is how a test tells the two branches apart.
 */
function stubDb(): Db {
  return {
    execute: () => Promise.resolve([]),
    select: () => {
      throw new Error("nightly branch");
    },
  } as unknown as Db;
}

const env = { WEB_ORIGIN: "https://molo.example" } as Bindings;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cron branch", () => {
  it("posts the content report on Monday 08:00 UTC and does no nightly work", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runCron(stubDb(), env, {
      cron: CRON,
      scheduledTime: Date.parse("2026-09-07T08:00:00Z"),
    });
    const lines = log.mock.calls.map((c) => c.join(" "));
    expect(lines.some((l) => l.includes("*Molo content report* (2026-09-07)"))).toBe(true);
    expect(lines.some((l) => l.includes("[slack dry-run]"))).toBe(true);
    expect(lines.some((l) => l.includes("not posted (no SLACK_WEBHOOK_URL)"))).toBe(true);
    expect(lines.some((l) => l.includes("leagues finalised"))).toBe(false);
  });

  it("does the nightly work at 17:00 UTC", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      runCron(stubDb(), env, {
        cron: CRON,
        scheduledTime: Date.parse("2026-09-07T17:00:00Z"),
      }),
    ).rejects.toThrow("nightly branch");
  });

  it("owes each database job once a day or week, and nothing on other ticks", () => {
    expect(dueJobs(new Date("2026-09-07T17:00:00Z"))).toEqual({ nightly: true, weekly: false });
    expect(dueJobs(new Date("2026-09-07T17:05:00Z"))).toEqual({ nightly: false, weekly: false });
    expect(dueJobs(new Date("2026-09-07T08:00:00Z"))).toEqual({ nightly: false, weekly: true });
    expect(dueJobs(new Date("2026-09-08T08:00:00Z"))).toEqual({ nightly: false, weekly: false });
    expect(dueJobs(new Date("2026-09-07T12:35:00Z"))).toEqual({ nightly: false, weekly: false });
  });

  it("keeps the one cron string in step with wrangler.jsonc", () => {
    // `.href` keeps this a string: apps/api compiles against the Workers URL,
    // which is not node:url's URL.
    const config = readFileSync(
      fileURLToPath(new URL("../wrangler.jsonc", import.meta.url).href),
      "utf8",
    );
    expect(config).toContain(`"crons": ["${CRON}"]`);
  });
});
