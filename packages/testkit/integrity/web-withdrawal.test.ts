import {
  completeWebRefund,
  deleteUserAccount,
  exportUserData,
  listWebPurchases,
  pendingWebRefunds,
  pruneWebPurchases,
  recordWebConsent,
  requestWebWithdrawal,
  schema,
} from "@molo/db";
import { applyRevenueCatEvent, planOf, type RevenueCatEvent } from "@molo/gamification";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS } from "../src/fixtures.ts";
import { harness, type Harness } from "./helpers.ts";

let h: Harness;
const uid = FIXTURE_USERS.learner.id;
const start = new Date("2026-09-01T12:00Z");
const now = new Date("2026-09-11T12:00Z");
const end = new Date("2026-10-01T12:00Z");
const initial: RevenueCatEvent = {
  id: "web-initial",
  type: "INITIAL_PURCHASE",
  app_user_id: uid,
  entitlement_ids: ["plus"],
  store: "RC_BILLING",
  product_id: "molo_plus_monthly",
  original_transaction_id: "web-contract",
  transaction_id: "web-charge",
  purchased_at_ms: start.getTime(),
  expiration_at_ms: end.getTime(),
  event_timestamp_ms: start.getTime(),
  price_in_purchased_currency: 79,
  currency: "NOK",
};
beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => {
  await h?.close();
});
async function purchase(consent = true) {
  if (consent)
    await recordWebConsent(h.db, uid, "molo_plus_monthly", new Date(start.getTime() - 60_000));
  await applyRevenueCatEvent(h.db, initial);
  return (await listWebPurchases(h.db, uid, now))[0]!;
}

describe("web withdrawal with Postgres", () => {
  it("records a proportionate manual refund, revokes Plus atomically, and returns the same receipt on retry", async () => {
    const row = await purchase();
    expect(row.refundEstimate).toBe(52.67);
    expect((await planOf(h.db, uid, now)).plan).toBe("plus");
    const [a, b] = await Promise.all([
      requestWebWithdrawal(h.db, uid, row.id, now),
      requestWebWithdrawal(h.db, uid, row.id, now),
    ]);
    expect(a).toEqual(b);
    expect(a.requestedAt).toBe(now.toISOString());
    expect(await planOf(h.db, uid, now)).toMatchObject({ plan: "free", withdrawn: true });
    expect(await pendingWebRefunds(h.db)).toHaveLength(1);
    // A retry after the deadline must still return the accepted receipt.
    expect(
      (await requestWebWithdrawal(h.db, uid, row.id, new Date("2026-10-20"))).requestedAt,
    ).toBe(now.toISOString());
    await completeWebRefund(h.db, row.id, "fixture-refund-and-cancellation", now);
    expect(await pendingWebRefunds(h.db)).toEqual([]);
    expect((await listWebPurchases(h.db, uid, now))[0]?.resolvedAt).toBe(now.toISOString());
  });
  it("blocks late or replayed subscription events without revoking a different purchase", async () => {
    const row = await purchase();
    await requestWebWithdrawal(h.db, uid, row.id, now);
    await applyRevenueCatEvent(h.db, {
      ...initial,
      id: "late-renewal",
      type: "RENEWAL",
      event_timestamp_ms: now.getTime() + 1,
    });
    expect((await planOf(h.db, uid, now)).plan).toBe("free");
    await applyRevenueCatEvent(h.db, {
      id: "unidentified-grant",
      type: "TEMPORARY_ENTITLEMENT_GRANT",
      app_user_id: uid,
      event_timestamp_ms: now.getTime() + 2,
    });
    expect((await planOf(h.db, uid, now)).plan).toBe("free");
    await applyRevenueCatEvent(h.db, {
      ...initial,
      id: "new-contract",
      original_transaction_id: "another-contract",
      event_timestamp_ms: now.getTime() + 2,
      purchased_at_ms: now.getTime(),
    });
    expect((await planOf(h.db, uid, now)).plan).toBe("plus");
    await applyRevenueCatEvent(h.db, {
      ...initial,
      id: "old-contract-refund",
      type: "EXPIRATION",
      event_timestamp_ms: now.getTime() + 3,
    });
    expect((await planOf(h.db, uid, now)).plan).toBe("plus");
  });
  it("does not reopen a contract when its webhook races the withdrawal", async () => {
    const row = await purchase();
    await Promise.all([
      requestWebWithdrawal(h.db, uid, row.id, now),
      applyRevenueCatEvent(h.db, {
        ...initial,
        id: "race",
        type: "UNCANCELLATION",
        event_timestamp_ms: now.getTime(),
      }),
    ]);
    expect((await planOf(h.db, uid, now)).plan).toBe("free");
  });
  it("does not restart the window on renewal and does not apply stale events", async () => {
    const row = await purchase();
    await applyRevenueCatEvent(h.db, {
      ...initial,
      id: "renewal",
      type: "RENEWAL",
      purchased_at_ms: now.getTime(),
      event_timestamp_ms: now.getTime(),
    });
    expect((await listWebPurchases(h.db, uid, now))[0]?.purchasedAt).toBe(start.toISOString());
    await expect(requestWebWithdrawal(h.db, uid, row.id, new Date("2026-09-17"))).rejects.toThrow(
      "expired",
    );
    await applyRevenueCatEvent(h.db, {
      ...initial,
      id: "stale-expiry",
      type: "EXPIRATION",
      event_timestamp_ms: start.getTime() + 1,
    });
    expect((await planOf(h.db, uid, now)).plan).toBe("plus");
  });
  it("uses a trial conversion payment without extending the original contract deadline", async () => {
    await recordWebConsent(h.db, uid, "molo_plus_monthly", new Date(start.getTime() - 60_000));
    await applyRevenueCatEvent(h.db, { ...initial, price_in_purchased_currency: 0 });
    const paid = new Date("2026-09-08T12:00Z");
    const paidEnd = new Date("2026-10-08T12:00Z");
    await applyRevenueCatEvent(h.db, {
      ...initial,
      id: "conversion",
      type: "RENEWAL",
      purchased_at_ms: paid.getTime(),
      expiration_at_ms: paidEnd.getTime(),
      event_timestamp_ms: paid.getTime(),
      price_in_purchased_currency: 90,
    });
    const row = (await listWebPurchases(h.db, uid, now))[0]!;
    expect(row.purchasedAt).toBe(start.toISOString());
    expect(row.refundEstimate).toBe(81);
    expect((await requestWebWithdrawal(h.db, uid, row.id, now)).refundEstimate).toBe(81);
  });

  it("refuses another account's purchase and never offers native-store purchases", async () => {
    const row = await purchase();
    await expect(requestWebWithdrawal(h.db, FIXTURE_USERS.editorA.id, row.id, now)).rejects.toThrow(
      "not_found",
    );
    await applyRevenueCatEvent(h.db, {
      ...initial,
      id: "apple",
      app_user_id: FIXTURE_USERS.editorA.id,
      store: "APP_STORE",
      original_transaction_id: "apple-contract",
    });
    expect(await listWebPurchases(h.db, FIXTURE_USERS.editorA.id, now)).toEqual([]);
  });
  it("does not deduct for use without a matching prior express request", async () => {
    await recordWebConsent(h.db, uid, "molo_plus_monthly", new Date(start.getTime() + 60_000));
    const row = await purchase(false);
    expect(row.refundEstimate).toBe(79);
    expect((await requestWebWithdrawal(h.db, uid, row.id, now)).refundEstimate).toBe(79);
  });
  it("exports purchase records, retains paid refunds on deletion and removes abandoned checkouts", async () => {
    const row = await purchase();
    await requestWebWithdrawal(h.db, uid, row.id, now);
    await recordWebConsent(h.db, uid, "molo_plus_yearly", now);
    const exported = await exportUserData(h.db, uid);
    expect(exported["webPurchases"]).toHaveLength(2);
    await deleteUserAccount(h.db, uid);
    const records = await h.db.select().from(schema.webPurchases);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      userId: null,
      revenuecatUserId: uid,
      originalTransactionId: "web-contract",
    });
    expect(await pendingWebRefunds(h.db)).toHaveLength(1);
  });
  it("prunes expired records only when applied, never an unresolved refund", async () => {
    const row = await purchase();
    await requestWebWithdrawal(h.db, uid, row.id, now);
    const abandoned = await recordWebConsent(h.db, uid, "molo_plus_yearly", now);
    await h.db
      .update(schema.webPurchases)
      .set({ createdAt: start })
      .where(eq(schema.webPurchases.id, abandoned.id));
    const later = new Date("2032-01-01T12:00Z");
    expect(await pruneWebPurchases(h.db, false, later)).toBe(1);
    expect(await h.db.select().from(schema.webPurchases)).toHaveLength(2);
    expect(await pruneWebPurchases(h.db, true, later)).toBe(1);
    await completeWebRefund(h.db, row.id, "fixture-resolved", later);
    expect(await pruneWebPurchases(h.db, true, later)).toBe(0);
    expect(await pruneWebPurchases(h.db, true, new Date("2038-01-01"))).toBe(1);
  });
});
