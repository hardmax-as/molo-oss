import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { ageStepAllows, requireAgeConfirmed } from "./age-step.ts";
import type { AppEnv } from "./env.ts";

describe("ageStepAllows", () => {
  it.each([
    ["GET", "/me"],
    ["POST", "/me/age"],
    ["POST", "/me/apple/authorization-code"],
    ["DELETE", "/me"],
    ["GET", "/me/export"],
    ["DELETE", "/me/push-token"],
    ["GET", "/health"],
    ["GET", "/auth/providers"],
    ["POST", "/webhooks/revenuecat"],
    ["get", "/me/"],
  ])("lets %s %s through", (method, path) => {
    expect(ageStepAllows(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/me/progress"],
    ["PUT", "/me/prefs"],
    ["POST", "/me/push-token"],
    ["POST", "/me/import-progress"],
    ["POST", "/me/web-checkout"],
    ["GET", "/units"],
    ["GET", "/path"],
    ["GET", "/leagues/current"],
    ["GET", "/edit/queue"],
    ["GET", "/edit/preview/units"],
    ["GET", "/audio/queue"],
    ["POST", "/me"],
    ["GET", "/me/age"],
    ["GET", "/me/apple/authorization-code"],
    ["GET", "/me/export/extra"],
  ])("refuses %s %s", (method, path) => {
    expect(ageStepAllows(method, path)).toBe(false);
  });
});

describe("requireAgeConfirmed", () => {
  const app = (ageRequired: boolean | undefined) =>
    new Hono<AppEnv>()
      .use("*", async (c, next) => {
        if (ageRequired !== undefined) c.set("ageRequired", ageRequired);
        await next();
      })
      .use("*", requireAgeConfirmed)
      .all("*", (c) => c.json({ reached: true }));

  it("answers 403 age_required for a pending account", async () => {
    const res = await app(true).request("/me/progress");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "age_required" } });
    expect((await app(true).request("/me")).status).toBe(200);
  });

  it("changes nothing for a confirmed account or a guest", async () => {
    expect((await app(false).request("/me/progress")).status).toBe(200);
    expect((await app(undefined).request("/units")).status).toBe(200);
  });
});
