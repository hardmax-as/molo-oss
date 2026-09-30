import type { Actor } from "@molo/core";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AppEnv, Bindings } from "./env.ts";
import { consume, rateLimit, reportRateLimit } from "./ratelimit.ts";

/**
 * A stand-in for the Workers rate-limiting binding. It answers from a script,
 * so a test can say "refuse, refuse, then allow" without waiting a minute,
 * and it records the keys it was asked about.
 */
function limiter(answers: boolean[]) {
  const keys: string[] = [];
  let i = 0;
  return {
    keys,
    binding: {
      limit: (opts: { key: string }) => {
        keys.push(opts.key);
        const success = answers[Math.min(i, answers.length - 1)] ?? true;
        i += 1;
        return Promise.resolve({ success });
      },
    } as unknown as RateLimit,
  };
}

const actor = (id: string): Actor => ({ id, roles: ["learner"] });

/** The report endpoint's shape: `requireUser` has already put an actor in scope. */
function appWith(env: Partial<Bindings>, who: Actor | null) {
  const app = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("actor", who);
      await next();
    })
    .post("/exercises/:id/report", reportRateLimit, (c) => c.json({ ok: true }, 201));
  return async (): Promise<Response> =>
    app.request("/exercises/e1/report", { method: "POST" }, env as Bindings);
}

describe("reportRateLimit", () => {
  it("refuses over the limit, with a code and a message the client can show", async () => {
    const { binding, keys } = limiter([false]);
    const res = await appWith({ REPORT_LIMITER: binding }, actor("learner-1"))();

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("report_rate_limited");
    expect(body.error.message).not.toBe("");
    // Metered per account, not per address: the key is the learner's id.
    expect(keys).toEqual(["REPORT_LIMITER:learner-1"]);
  });

  it("lets the next report through once the window has passed", async () => {
    const { binding } = limiter([false, true]);
    const request = appWith({ REPORT_LIMITER: binding }, actor("learner-1"));

    expect((await request()).status).toBe(429);
    expect((await request()).status).toBe(201);
  });

  it("meters each learner separately", async () => {
    const { binding, keys } = limiter([true]);
    await appWith({ REPORT_LIMITER: binding }, actor("learner-1"))();
    await appWith({ REPORT_LIMITER: binding }, actor("learner-2"))();
    expect(keys).toEqual(["REPORT_LIMITER:learner-1", "REPORT_LIMITER:learner-2"]);
  });

  it("passes through when the binding is not there", async () => {
    const res = await appWith({}, actor("learner-1"))();
    expect(res.status).toBe(201);
  });

  it("leaves the 401 to requireUser when there is no session", async () => {
    const { binding, keys } = limiter([false]);
    const res = await appWith({ REPORT_LIMITER: binding }, null)();
    expect(res.status).toBe(201);
    expect(keys).toEqual([]);
  });
});

describe("consume", () => {
  it("allows the request when the limiter itself is broken", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const binding = {
      limit: () => Promise.reject(new Error("limiter down")),
    } as unknown as RateLimit;

    await expect(
      consume({ REPORT_LIMITER: binding } as Bindings, "REPORT_LIMITER", "u"),
    ).resolves.toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("rateLimit", () => {
  it("keys the unauthenticated limiters on the client address", async () => {
    const { binding, keys } = limiter([false]);
    const app = new Hono<AppEnv>()
      .use("*", rateLimit("AUTH_LIMITER"))
      .get("/api/auth/x", (c) => c.text("ok"));

    const res = await app.request(
      "/api/auth/x",
      { headers: { "cf-connecting-ip": "203.0.113.7" } },
      { AUTH_LIMITER: binding } as Bindings,
    );

    expect(res.status).toBe(429);
    expect(keys).toEqual(["AUTH_LIMITER:203.0.113.7"]);
  });
});
