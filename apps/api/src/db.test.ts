import { createDb } from "@molo/db";
import { Hono } from "hono";
import { afterEach, expect, it, vi } from "vitest";

import { afterResponse } from "./background.ts";
import { dbMiddleware } from "./db.ts";
import type { AppEnv, Bindings } from "./env.ts";

vi.mock("@molo/db", () => ({ createDb: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it("keeps the request database open for waitUntil work without holding the response", async () => {
  const close = vi.fn(async () => {});
  vi.mocked(createDb).mockReturnValue({ db: {} as never, close });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const app = new Hono<AppEnv>().use("*", dbMiddleware).get("/", (c) => {
    c.res = c.json({ ok: true });
    afterResponse(c, "test query", async () => {
      await gate;
      expect(close).not.toHaveBeenCalled();
    });
    return c.res;
  });
  const tasks: Promise<unknown>[] = [];
  try {
    const response = await app.request(
      "/",
      {},
      { HYPERDRIVE: { connectionString: "fixture" } } as Bindings,
      {
        waitUntil: (task) => {
          tasks.push(task);
        },
        passThroughOnException() {},
        props: {},
      },
    );
    expect(response.status).toBe(200);
    expect(close).not.toHaveBeenCalled();
  } finally {
    release();
    await Promise.all(tasks);
  }
  expect(close).toHaveBeenCalledTimes(1);
});
