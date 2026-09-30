import {
  activePlusMemberCount,
  completedAccountCount,
  completedMemberNotification,
  confirmPendingAge,
  lastPlusEventId,
  schema,
} from "@molo/db";
import { applyRevenueCatEvent } from "@molo/gamification";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, expect, it } from "vitest";

import { harness, type Harness } from "./helpers.ts";

let h: Harness;
beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => h?.close());

it("counts completed accounts, excludes pending users and reads no email into notification data", async () => {
  const baseline = await completedAccountCount(h.db);
  const id = `notification-${crypto.randomUUID()}`;
  await h.db
    .insert(schema.users)
    .values({ id, name: "Example Member", email: `${id}@fixture.invalid`, agePending: true });
  expect(await completedAccountCount(h.db)).toBe(baseline);
  expect(await completedMemberNotification(h.db, id)).toBeNull();
  expect(await confirmPendingAge(h.db, id, "NO")).toBe(true);
  await h.db
    .insert(schema.accounts)
    .values({ id, userId: id, providerId: "apple", accountId: "fixture-subject" });
  await h.db.insert(schema.userPrefs).values({ userId: id, sourceLang: "nb" });
  expect(await completedMemberNotification(h.db, id)).toEqual({
    name: "Example Member",
    memberNumber: baseline + 1,
    provider: "apple",
    sourceLang: "nb",
  });
  expect(await confirmPendingAge(h.db, id, "NO")).toBe(false);
  await h.db.delete(schema.users).where(eq(schema.users.id, id));
  expect(await completedAccountCount(h.db)).toBe(baseline);
});

it("reads last_event_id before apply and counts cancelled-but-unexpired Plus members", async () => {
  const userId = "fx_learner";
  const now = new Date();
  const event = {
    id: "notification-purchase",
    app_user_id: userId,
    type: "INITIAL_PURCHASE",
    entitlement_ids: ["plus"],
    product_id: "molo_plus_yearly",
    expiration_at_ms: now.getTime() + 60_000,
  };
  expect(await lastPlusEventId(h.db, userId)).toBeNull();
  await applyRevenueCatEvent(h.db, event);
  expect(await lastPlusEventId(h.db, userId)).toBe(event.id);
  expect(await activePlusMemberCount(h.db, now)).toBe(1);
  await applyRevenueCatEvent(h.db, { ...event, id: "notification-cancel", type: "CANCELLATION" });
  expect(await activePlusMemberCount(h.db, now)).toBe(1);
  expect(await activePlusMemberCount(h.db, new Date(event.expiration_at_ms))).toBe(0);
  await applyRevenueCatEvent(h.db, { ...event, id: "notification-billing", type: "BILLING_ISSUE" });
  expect(await lastPlusEventId(h.db, userId)).toBe("notification-cancel");
  await applyRevenueCatEvent(h.db, { ...event, id: "notification-expire", type: "EXPIRATION" });
  expect(await activePlusMemberCount(h.db, now)).toBe(0);
});
