/**
 * Hearts and entitlements (docs/MONETISATION.md). Hearts are the free
 * tier's pacing: five, one lost per wrong answer in a lesson, one back
 * every four hours or per practice session. An active `plus` entitlement
 * makes them unlimited. Entitlements are written by the RevenueCat webhook
 * or by an admin (promo, manual), never by a client.
 */

import {
  boolean,
  index,
  numeric,
  uuid,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";

export const hearts = pgTable("hearts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  hearts: integer("hearts").notNull().default(5),
  /** When `hearts` was last written; regeneration is computed from here, never stored. */
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  /** Ratings since the last practice refill, so five ratings give one heart. */
  practiceCount: integer("practice_count").notNull().default(0),
});

export const entitlements = pgTable(
  "entitlements",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** RevenueCat entitlement identifier, e.g. "plus". */
    entitlement: text("entitlement").notNull(),
    active: boolean("active").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** revenuecat | manual | promo */
    source: text("source").notNull(),
    productId: text("product_id"),
    store: text("store"),
    /** Last webhook event id applied, for idempotency. */
    lastEventId: text("last_event_id"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    originalTransactionId: text("original_transaction_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entitlement] })],
);

/** Consent, initial web purchase and any withdrawal. One row per checkout/contract.
 * Paid records survive account deletion for refund/accounting follow-up. */
export const webPurchases = pgTable(
  "web_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    revenuecatUserId: text("revenuecat_user_id").notNull(),
    productId: text("product_id").notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true }),
    consentVersion: text("consent_version"),
    originalTransactionId: text("original_transaction_id").unique(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }),
    periodStartsAt: timestamp("period_starts_at", { withTimezone: true }),
    periodEndsAt: timestamp("period_ends_at", { withTimezone: true }),
    store: text("store"),
    price: numeric("price", { precision: 18, scale: 6 }),
    currency: text("currency"),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    refundEstimate: numeric("refund_estimate", { precision: 18, scale: 6 }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    refundReference: text("refund_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_purchases_user_idx").on(t.userId)],
);
