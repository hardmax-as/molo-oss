import type { RevenueCatEvent } from "@molo/core";
import { lastPlusEventId } from "@molo/db";
import { applyRevenueCatEvent } from "@molo/gamification";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppEnv, Bindings } from "../env.ts";
import { notifySubscription } from "../slack-events.ts";
import { webhookRoutes } from "./webhooks.ts";

vi.mock("@molo/db", () => ({ lastPlusEventId: vi.fn() }));
vi.mock("@molo/gamification", () => ({ applyRevenueCatEvent: vi.fn() }));
vi.mock("../slack-events.ts", () => ({ notifySubscription: vi.fn() }));

const event: RevenueCatEvent = {
  id: "purchase-1",
  type: "INITIAL_PURCHASE",
  app_user_id: "member-1",
  entitlement_ids: ["plus"],
  product_id: "molo_plus_yearly",
  store: "APP_STORE",
  price_in_purchased_currency: 49.99,
  currency: "USD",
  environment: "SANDBOX",
};
let storedId: string | null;
let tasks: Promise<unknown>[];
let readBeforeApply: (string | null)[];
const env = { ENVIRONMENT: "prod", REVENUECAT_WEBHOOK_SECRET: "fixture-secret" } as Bindings;
const app = new Hono<AppEnv>()
  .use("*", async (c, next) => {
    c.set("db", {} as never);
    await next();
  })
  .route("/", webhookRoutes);
const deliver = (ev = event, authorization = "Bearer fixture-secret") =>
  app.request(
    "/webhooks/revenuecat",
    {
      method: "POST",
      headers: { authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ event: ev }),
    },
    env,
    {
      waitUntil: (task: Promise<unknown>) => {
        tasks.push(task);
      },
      passThroughOnException() {},
      props: {},
    },
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  storedId = null;
  tasks = [];
  readBeforeApply = [];
  vi.mocked(lastPlusEventId).mockImplementation(async () => {
    readBeforeApply.push(storedId);
    return storedId;
  });
  vi.mocked(applyRevenueCatEvent).mockImplementation(async (_db, ev) => {
    if (ev.type === "TEST" || ev.type === "BILLING_ISSUE") return null;
    storedId = ev.id;
    return { userId: ev.app_user_id, entitlement: "plus", active: true };
  });
  vi.mocked(notifySubscription).mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

describe("RevenueCat notification boundary", () => {
  it("reads the previous ID before apply and notifies once for a sequential retry", async () => {
    expect((await deliver()).status).toBe(200);
    await Promise.all(tasks);
    expect((await deliver()).status).toBe(200);
    await Promise.all(tasks);
    expect(readBeforeApply).toEqual([null, event.id]);
    expect(applyRevenueCatEvent).toHaveBeenCalledTimes(2);
    expect(notifySubscription).toHaveBeenCalledTimes(1);
    expect(notifySubscription).toHaveBeenCalledWith(env, expect.anything(), event);
  });
  it.each([
    "RENEWAL",
    "CANCELLATION",
    "UNCANCELLATION",
    "EXPIRATION",
    "BILLING_ISSUE",
    "PRODUCT_CHANGE",
  ])("calls the notifier once for a delivered %s", async (type) => {
    expect((await deliver({ ...event, type })).status).toBe(200);
    await Promise.all(tasks);
    expect(notifySubscription).toHaveBeenCalledTimes(1);
  });
  it("accepts duplicate billing-issue notifications as the documented best-effort limit", async () => {
    const issue = { ...event, type: "BILLING_ISSUE" };
    await deliver(issue);
    await deliver(issue);
    await Promise.all(tasks);
    expect(notifySubscription).toHaveBeenCalledTimes(2);
  });
  it("still returns 200 when the notifier throws, without leaking the error", async () => {
    vi.mocked(notifySubscription).mockImplementation(() => {
      throw new Error("private webhook URL");
    });
    const response = await deliver();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    await expect(Promise.all(tasks)).resolves.toBeDefined();
    expect(console.warn).toHaveBeenCalledWith("[background] subscription notification failed");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private webhook URL");
  });
  it("returns without waiting for Slack", async () => {
    let release!: () => void;
    vi.mocked(notifySubscription).mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    try {
      const response = await deliver();
      expect(response.status).toBe(200);
      expect(tasks).toHaveLength(1);
    } finally {
      release();
      await Promise.all(tasks);
    }
  });
  it("keeps processing if the best-effort notification lookup fails", async () => {
    vi.mocked(lastPlusEventId).mockRejectedValue(new Error("private DB details"));
    expect((await deliver()).status).toBe(200);
    await Promise.all(tasks);
    expect(applyRevenueCatEvent).toHaveBeenCalledTimes(1);
    expect(notifySubscription).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith("[slack] subscription dedup lookup failed");
  });
  it("ignores TEST and unrelated products", async () => {
    await deliver({ ...event, type: "TEST" });
    await deliver({ ...event, entitlement_ids: ["other"], product_id: "other" });
    expect(notifySubscription).not.toHaveBeenCalled();
    expect(lastPlusEventId).not.toHaveBeenCalled();
  });
  it("rejects unauthorised or malformed events before any notification", async () => {
    expect((await deliver(event, "wrong")).status).toBe(401);
    expect((await deliver({ ...event, id: "" })).status).toBe(400);
    expect(notifySubscription).not.toHaveBeenCalled();
    expect(applyRevenueCatEvent).not.toHaveBeenCalled();
  });
});
