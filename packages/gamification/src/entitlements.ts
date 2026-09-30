/**
 * Entitlements written from RevenueCat webhook events (or by an admin).
 * The client never writes these; it only reads `plan` from /me.
 */

import { isWebStore, type RevenueCatEvent } from "@molo/core";
import { schema, recordWebPurchaseEvent, wasWebPurchaseWithdrawn, type Db } from "@molo/db";
export type { RevenueCatEvent } from "@molo/core";
import { and, eq } from "drizzle-orm";

export const PLUS = "plus";

const GRANTING = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "PURCHASE_REDEEMED",
  "REFUND_REVERSED",
  "TRANSFER",
]);
const REVOKING = new Set(["EXPIRATION", "CANCELLATION_REFUND"]);

/**
 * Maps an event to what the entitlement row should say. CANCELLATION keeps
 * access until `expiration_at_ms` (the subscription runs out, it is not cut
 * off); EXPIRATION and refunds revoke; BILLING_ISSUE changes nothing until
 * the store expires the subscription.
 */
export function decideEntitlement(
  ev: RevenueCatEvent,
): { active: boolean; expiresAt: Date | null } | null {
  const expiresAt = ev.expiration_at_ms ? new Date(ev.expiration_at_ms) : null;
  if (GRANTING.has(ev.type)) return { active: true, expiresAt };
  if (ev.type === "CANCELLATION") return { active: true, expiresAt };
  if (REVOKING.has(ev.type)) return { active: false, expiresAt };
  return null;
}

/** Applies one webhook event. Idempotent on event id. Returns what changed, or null when ignored. */
export async function applyRevenueCatEvent(
  db: Db,
  ev: RevenueCatEvent,
): Promise<{ userId: string; entitlement: string; active: boolean } | null> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, ev.app_user_id))
      .for("update");
    if (!user) return null;
    return applyLockedEvent(tx, ev);
  });
}

async function applyLockedEvent(
  db: Db,
  ev: RevenueCatEvent,
): Promise<{ userId: string; entitlement: string; active: boolean } | null> {
  const decision = decideEntitlement(ev);
  if (!decision) return null;
  const ids = ev.entitlement_ids && ev.entitlement_ids.length > 0 ? ev.entitlement_ids : [PLUS];
  const transaction = ev.original_transaction_id ?? ev.transaction_id ?? null;
  // The documented web lifecycle payload contains these fields. Missing identity must
  // never reactivate a contract whose withdrawal cannot be checked.
  if (isWebStore(ev.store) && (!transaction || ev.event_timestamp_ms == null)) return null;
  if (ids.includes(PLUS)) await recordWebPurchaseEvent(db, ev);
  const withdrawn = !!transaction && (await wasWebPurchaseWithdrawn(db, transaction));
  let last: { userId: string; entitlement: string; active: boolean } | null = null;
  for (const entitlement of ids) {
    const [existing] = await db
      .select({
        lastEventId: schema.entitlements.lastEventId,
        lastEventAt: schema.entitlements.lastEventAt,
        originalTransactionId: schema.entitlements.originalTransactionId,
      })
      .from(schema.entitlements)
      .where(
        and(
          eq(schema.entitlements.userId, ev.app_user_id),
          eq(schema.entitlements.entitlement, entitlement),
        ),
      )
      .limit(1);
    if (existing?.lastEventId === ev.id) continue;
    if (
      !transaction &&
      existing?.originalTransactionId &&
      (await wasWebPurchaseWithdrawn(db, existing.originalTransactionId))
    )
      continue;
    if (
      ev.event_timestamp_ms != null &&
      existing?.lastEventAt &&
      ev.event_timestamp_ms <= existing.lastEventAt.getTime()
    )
      continue;
    if (withdrawn && existing?.originalTransactionId !== transaction) continue;
    const values = {
      userId: ev.app_user_id,
      entitlement,
      active: decision.active && !withdrawn,
      expiresAt: decision.expiresAt,
      source: "revenuecat",
      productId: ev.product_id ?? null,
      store: ev.store ?? null,
      lastEventId: ev.id,
      lastEventAt:
        ev.event_timestamp_ms == null
          ? (existing?.lastEventAt ?? null)
          : new Date(ev.event_timestamp_ms),
      originalTransactionId: transaction,
      updatedAt: new Date(),
    };
    await db
      .insert(schema.entitlements)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.entitlements.userId, schema.entitlements.entitlement],
        set: values,
      });
    last = { userId: ev.app_user_id, entitlement, active: values.active };
  }
  return last;
}

/** Admin or promo grant, e.g. for testers before the stores exist. */
export async function grantEntitlement(
  db: Db,
  userId: string,
  entitlement: string,
  source: "manual" | "promo",
  expiresAt: Date | null,
): Promise<void> {
  const values = {
    userId,
    entitlement,
    active: true,
    expiresAt,
    source,
    productId: null,
    store: null,
    originalTransactionId: null,
    lastEventAt: null,
    lastEventId: null,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.entitlements)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.entitlements.userId, schema.entitlements.entitlement],
      set: values,
    });
}

export async function revokeEntitlement(
  db: Db,
  userId: string,
  entitlement: string,
): Promise<void> {
  await db
    .update(schema.entitlements)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(eq(schema.entitlements.userId, userId), eq(schema.entitlements.entitlement, entitlement)),
    );
}

export interface PlanView {
  readonly plan: "free" | "plus";
  readonly expiresAt: string | null;
  readonly source: string | null;
  readonly withdrawn: boolean;
}

export async function planOf(db: Db, userId: string, now = new Date()): Promise<PlanView> {
  const [row] = await db
    .select()
    .from(schema.entitlements)
    .where(and(eq(schema.entitlements.userId, userId), eq(schema.entitlements.entitlement, PLUS)))
    .limit(1);
  const active = !!row && row.active && (!row.expiresAt || row.expiresAt > now);
  return {
    plan: active ? "plus" : "free",
    expiresAt: row?.expiresAt?.toISOString() ?? null,
    source: active ? row.source : null,
    withdrawn:
      !!row?.originalTransactionId &&
      (await wasWebPurchaseWithdrawn(db, row.originalTransactionId)),
  };
}
