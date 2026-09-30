import { describe, expect, it, vi } from "vitest";

import { audioBacklog } from "./audio-backlog.ts";

describe("audioBacklog", () => {
  it("reports the waiting count and the oldest upload's time", async () => {
    const ts = Date.parse("2026-09-26T07:48:00Z");
    const r = await audioBacklog({
      metrics: async () => ({ backlogCount: 3, oldestMessageTimestamp: ts }),
    });
    expect(r).toEqual({ waiting: 3, oldestAt: "2026-09-26T07:48:00.000Z" });
  });

  it("accepts a Date for the oldest timestamp", async () => {
    const r = await audioBacklog({
      metrics: async () => ({
        backlogCount: 1,
        oldestMessageTimestamp: new Date("2026-09-26T07:48:00Z"),
      }),
    });
    expect(r.oldestAt).toBe("2026-09-26T07:48:00.000Z");
  });

  it("says nothing about the oldest when the queue is empty", async () => {
    const r = await audioBacklog({
      metrics: async () => ({ backlogCount: 0, oldestMessageTimestamp: 0 }),
    });
    expect(r).toEqual({ waiting: 0, oldestAt: null });
  });

  it("answers unknown when the binding has no metrics or they fail", async () => {
    expect(await audioBacklog({})).toEqual({ waiting: null, oldestAt: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(
      await audioBacklog({
        metrics: async () => {
          throw new Error("not implemented");
        },
      }),
    ).toEqual({ waiting: null, oldestAt: null });
    warn.mockRestore();
  });
});
