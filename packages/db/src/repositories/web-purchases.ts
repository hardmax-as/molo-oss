import {
  canWithdraw,
  isWebStore,
  WEB_CONSENT_VERSION,
  withdrawalDeadline,
  withdrawalRefund,
  type RevenueCatEvent,
  type WebPurchaseView,
} from "@molo/core";
import { or, lt, and, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";

import type { Db } from "../client.ts";
import { entitlements, users, webPurchases } from "../schema/index.ts";

export async function recordWebConsent(
  db: Db,
  userId: string,
  productId: string,
  now = new Date(),
) {
  const [row] = await db
    .insert(webPurchases)
    .values({
      userId,
      revenuecatUserId: userId,
      productId,
      consentedAt: now,
      consentVersion: WEB_CONSENT_VERSION,
    })
    .returning({
      id: webPurchases.id,
      consentedAt: webPurchases.consentedAt,
      version: webPurchases.consentVersion,
    });
  return row!;
}

/** Called under the webhook's user lock. Renewals never reset the initial contract date. */
export async function recordWebPurchaseEvent(db: Db, ev: RevenueCatEvent) {
  if (
    !isWebStore(ev.store) ||
    !["INITIAL_PURCHASE", "RENEWAL"].includes(ev.type) ||
    !ev.product_id ||
    ev.purchased_at_ms == null
  )
    return;
  const transaction = ev.original_transaction_id ?? ev.transaction_id;
  if (!transaction) return;
  const [existing] = await db
    .select()
    .from(webPurchases)
    .where(eq(webPurchases.originalTransactionId, transaction));
  const purchasedAt = new Date(ev.purchased_at_ms);
  if (existing) {
    // Trial conversions can charge within the original withdrawal period.
    // Preserve the contract date, but calculate against the latest paid period.
    if (
      ev.type === "RENEWAL" &&
      !existing.requestedAt &&
      (!existing.periodStartsAt || purchasedAt > existing.periodStartsAt)
    ) {
      await db
        .update(webPurchases)
        .set({
          periodStartsAt: purchasedAt,
          periodEndsAt: ev.expiration_at_ms == null ? null : new Date(ev.expiration_at_ms),
          price:
            ev.price_in_purchased_currency == null ? null : String(ev.price_in_purchased_currency),
          currency: ev.currency ?? null,
        })
        .where(eq(webPurchases.id, existing.id));
    }
    return;
  }
  // A renewal alone cannot prove when the original agreement began.
  if (ev.type !== "INITIAL_PURCHASE") return;
  // Associate only a recent, unused server-side request for this exact account/product.
  // Missing proof means no deduction for use when the operator refunds.
  const [consent] = await db
    .select({ id: webPurchases.id })
    .from(webPurchases)
    .where(
      and(
        eq(webPurchases.userId, ev.app_user_id),
        eq(webPurchases.productId, ev.product_id),
        isNull(webPurchases.originalTransactionId),
        lte(webPurchases.consentedAt, purchasedAt),
        gte(webPurchases.consentedAt, new Date(purchasedAt.getTime() - 3_600_000)),
      ),
    )
    .orderBy(desc(webPurchases.consentedAt))
    .limit(1);
  const values = {
    originalTransactionId: transaction,
    purchasedAt,
    periodStartsAt: purchasedAt,
    periodEndsAt: ev.expiration_at_ms == null ? null : new Date(ev.expiration_at_ms),
    store: ev.store ?? null,
    price: ev.price_in_purchased_currency == null ? null : String(ev.price_in_purchased_currency),
    currency: ev.currency ?? null,
  };
  if (consent) await db.update(webPurchases).set(values).where(eq(webPurchases.id, consent.id));
  else
    await db.insert(webPurchases).values({
      userId: ev.app_user_id,
      revenuecatUserId: ev.app_user_id,
      productId: ev.product_id,
      ...values,
    });
}
export async function wasWebPurchaseWithdrawn(db: Db, transaction: string) {
  const [row] = await db
    .select({ id: webPurchases.id })
    .from(webPurchases)
    .where(
      and(eq(webPurchases.originalTransactionId, transaction), isNotNull(webPurchases.requestedAt)),
    );
  return !!row;
}
function view(row: typeof webPurchases.$inferSelect, now: Date): WebPurchaseView {
  if (!row.purchasedAt) throw new Error("not a completed purchase");
  return {
    id: row.id,
    productId: row.productId,
    purchasedAt: row.purchasedAt.toISOString(),
    deadline: withdrawalDeadline(row.purchasedAt).toISOString(),
    eligible: !row.requestedAt && canWithdraw(row.purchasedAt, now),
    requestedAt: row.requestedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    refundEstimate: row.requestedAt
      ? row.refundEstimate === null
        ? null
        : Number(row.refundEstimate)
      : withdrawalRefund(
          row.price === null ? null : Number(row.price),
          row.currency,
          row.periodStartsAt ?? row.purchasedAt,
          row.periodEndsAt,
          now,
          !!row.consentedAt,
        ),
    currency: row.currency,
  };
}
export async function listWebPurchases(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<WebPurchaseView[]> {
  const rows = await db
    .select()
    .from(webPurchases)
    .where(and(eq(webPurchases.userId, userId), isNotNull(webPurchases.purchasedAt)))
    .orderBy(desc(webPurchases.purchasedAt))
    .limit(20);
  return rows.map((row) => view(row, now));
}
export class WithdrawalError extends Error {
  constructor(readonly code: "not_found" | "expired") {
    super(code);
  }
}
/** Receipt and access revocation commit together. Repeated requests return the first receipt. */
export async function requestWebWithdrawal(
  db: Db,
  userId: string,
  purchaseId: string,
  now = new Date(),
): Promise<WebPurchaseView> {
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [row] = await tx
      .select()
      .from(webPurchases)
      .where(and(eq(webPurchases.id, purchaseId), eq(webPurchases.userId, userId)))
      .for("update");
    if (!row?.purchasedAt || !isWebStore(row.store)) throw new WithdrawalError("not_found");
    if (row.requestedAt) return view(row, now);
    if (!canWithdraw(row.purchasedAt, now)) throw new WithdrawalError("expired");
    const estimate = withdrawalRefund(
      row.price === null ? null : Number(row.price),
      row.currency,
      row.periodStartsAt ?? row.purchasedAt,
      row.periodEndsAt,
      now,
      !!row.consentedAt,
    );
    const [saved] = await tx
      .update(webPurchases)
      .set({ requestedAt: now, refundEstimate: estimate === null ? null : String(estimate) })
      .where(eq(webPurchases.id, row.id))
      .returning();
    if (row.originalTransactionId)
      await tx
        .update(entitlements)
        .set({ active: false, updatedAt: now })
        .where(
          and(
            eq(entitlements.userId, userId),
            eq(entitlements.entitlement, "plus"),
            eq(entitlements.source, "revenuecat"),
            eq(entitlements.originalTransactionId, row.originalTransactionId),
          ),
        );
    return view(saved!, now);
  });
}
/** Operational queue: cancellation and payment refund must both be performed before resolving. */
export async function pendingWebRefunds(db: Db) {
  return db
    .select()
    .from(webPurchases)
    .where(and(isNotNull(webPurchases.requestedAt), isNull(webPurchases.resolvedAt)))
    .orderBy(webPurchases.requestedAt);
}
export async function completeWebRefund(db: Db, id: string, reference: string, now = new Date()) {
  if (!reference.trim()) throw new Error("refund reference required");
  const [row] = await db
    .update(webPurchases)
    .set({ resolvedAt: now, refundReference: reference.trim() })
    .where(
      and(
        eq(webPurchases.id, id),
        isNotNull(webPurchases.requestedAt),
        isNull(webPurchases.resolvedAt),
      ),
    )
    .returning({ id: webPurchases.id });
  if (!row) throw new Error("pending refund not found");
  return row;
}

/** Abandoned checkouts: 30 days. Paid records: five years after the latest payment/refund year.
 * Unresolved refunds are retained until the operator finishes them. */
export async function pruneWebPurchases(db: Db, apply: boolean, now = new Date()) {
  const abandoned = new Date(now.getTime() - 30 * 86_400_000);
  const paidCutoff = new Date(Date.UTC(now.getUTCFullYear() - 5, 0, 1));
  const predicate = or(
    and(isNull(webPurchases.purchasedAt), lt(webPurchases.createdAt, abandoned)),
    and(
      or(
        lt(webPurchases.periodStartsAt, paidCutoff),
        and(isNull(webPurchases.periodStartsAt), lt(webPurchases.purchasedAt, paidCutoff)),
      ),
      or(isNull(webPurchases.requestedAt), lt(webPurchases.resolvedAt, paidCutoff)),
    ),
  );
  if (apply)
    return (await db.delete(webPurchases).where(predicate).returning({ id: webPurchases.id }))
      .length;
  return (await db.select({ id: webPurchases.id }).from(webPurchases).where(predicate)).length;
}
