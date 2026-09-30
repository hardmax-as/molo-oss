/**
 * Inbound webhooks. RevenueCat posts subscription events here; the
 * Authorization header must equal the secret configured in the dashboard
 * (REVENUECAT_WEBHOOK_SECRET). Without a secret the endpoint refuses
 * everything, so a misconfigured deploy can never grant access.
 */

import { RevenueCatEvent, isPlusNotificationEvent } from "@molo/core";
import { lastPlusEventId } from "@molo/db";
import { applyRevenueCatEvent } from "@molo/gamification";
import { Schema } from "effect";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { afterResponse } from "../background.ts";
import type { AppEnv } from "../env.ts";
import { notifySubscription } from "../slack-events.ts";

function authorised(header: string | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  return header === secret || header === `Bearer ${secret}`;
}

export const webhookRoutes = new Hono<AppEnv>().post("/webhooks/revenuecat", async (c) => {
  if (!authorised(c.req.header("authorization"), c.env.REVENUECAT_WEBHOOK_SECRET)) {
    throw new HTTPException(401, { message: "webhook not authorised" });
  }
  const decoded = Schema.decodeUnknownEither(Schema.Struct({ event: RevenueCatEvent }))(
    await c.req.json().catch(() => null),
  );
  if (decoded._tag === "Left")
    throw new HTTPException(400, { message: "malformed RevenueCat event" });
  const ev = decoded.right.event;
  const db = c.get("db");
  const notify = isPlusNotificationEvent(ev);
  // Read before apply overwrites last_event_id. Billing issues do not write it;
  // their retries (and concurrent/old deliveries) may post twice by design.
  let duplicate = false;
  if (notify) {
    try {
      duplicate = (await lastPlusEventId(db, ev.app_user_id)) === ev.id;
    } catch {
      // Notification bookkeeping must not prevent the actual entitlement update.
      console.warn("[slack] subscription dedup lookup failed");
    }
  }
  const applied = await applyRevenueCatEvent(db, ev);
  console.log(
    `[revenuecat] ${ev.type} ${ev.id} user=${ev.app_user_id} env=${ev.environment ?? "?"} -> ${applied ? `${applied.entitlement}:${applied.active ? "active" : "inactive"}` : "ignored"}`,
  );
  const response = c.json({ ok: true, applied });
  c.res = response;
  if (notify && !duplicate) {
    afterResponse(c, "subscription notification", () => notifySubscription(c.env, db, ev));
  }
  return response;
});
