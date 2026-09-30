/**
 * Hearts: the free tier's pacing (docs/MONETISATION.md). Pure rules first,
 * then the database adapters. Regeneration is derived from `changedAt`, so
 * nothing ticks in the background; an active `plus` entitlement makes
 * hearts unlimited and every adapter short-circuits on it.
 */

import { schema, type Db } from "@molo/db";
import { and, eq, gt, isNull, or } from "drizzle-orm";

export const HEARTS = {
  max: 5,
  /** One heart back every four hours. */
  regenMs: 4 * 60 * 60 * 1000,
  /** Review ratings that earn one heart back. */
  practicePerHeart: 5,
} as const;

export interface HeartsState {
  readonly hearts: number;
  readonly max: number;
  readonly unlimited: boolean;
  /** ISO time the next heart arrives, null when full or unlimited. */
  readonly nextRegenAt: string | null;
  /** Ratings still needed for a practice refill. */
  readonly practiceLeft: number;
}

interface Row {
  hearts: number;
  changedAt: Date;
  practiceCount: number;
}

/** Applies regeneration up to `now`: returns the effective hearts and the moment the count last changed. */
export function regen(row: Row, now: Date, rules = HEARTS): { hearts: number; changedAt: Date } {
  if (row.hearts >= rules.max) return { hearts: rules.max, changedAt: row.changedAt };
  const elapsed = now.getTime() - row.changedAt.getTime();
  const gained = Math.floor(elapsed / rules.regenMs);
  if (gained <= 0) return { hearts: row.hearts, changedAt: row.changedAt };
  const hearts = Math.min(rules.max, row.hearts + gained);
  const changedAt =
    hearts >= rules.max ? now : new Date(row.changedAt.getTime() + gained * rules.regenMs);
  return { hearts, changedAt };
}

export function toState(row: Row, now: Date, unlimited: boolean, rules = HEARTS): HeartsState {
  if (unlimited)
    return {
      hearts: rules.max,
      max: rules.max,
      unlimited: true,
      nextRegenAt: null,
      practiceLeft: 0,
    };
  const r = regen(row, now, rules);
  return {
    hearts: r.hearts,
    max: rules.max,
    unlimited: false,
    nextRegenAt:
      r.hearts >= rules.max ? null : new Date(r.changedAt.getTime() + rules.regenMs).toISOString(),
    practiceLeft: Math.max(0, rules.practicePerHeart - row.practiceCount),
  };
}

// ---- database adapters -----------------------------------------------------

/** True when the learner has an active `plus` entitlement (unexpired). */
export async function hasPlus(db: Db, userId: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ active: schema.entitlements.active })
    .from(schema.entitlements)
    .where(
      and(
        eq(schema.entitlements.userId, userId),
        eq(schema.entitlements.entitlement, "plus"),
        eq(schema.entitlements.active, true),
        or(isNull(schema.entitlements.expiresAt), gt(schema.entitlements.expiresAt, now)),
      ),
    )
    .limit(1);
  return !!row;
}

async function loadRow(db: Db, userId: string): Promise<Row> {
  const [row] = await db
    .select()
    .from(schema.hearts)
    .where(eq(schema.hearts.userId, userId))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(schema.hearts)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  return created ?? { hearts: HEARTS.max, changedAt: new Date(), practiceCount: 0 };
}

export async function getHearts(db: Db, userId: string, now = new Date()): Promise<HeartsState> {
  const [row, plus] = await Promise.all([loadRow(db, userId), hasPlus(db, userId, now)]);
  return toState(row, now, plus);
}

/** A wrong answer in a lesson. Never below zero; a no-op with plus. */
export async function loseHeart(db: Db, userId: string, now = new Date()): Promise<HeartsState> {
  const [row, plus] = await Promise.all([loadRow(db, userId), hasPlus(db, userId, now)]);
  if (plus) return toState(row, now, true);
  const r = regen(row, now);
  const hearts = Math.max(0, r.hearts - 1);
  // Losing a heart from full starts the regeneration clock now; otherwise keep the partial progress.
  const changedAt = r.hearts >= HEARTS.max ? now : r.changedAt;
  await db.update(schema.hearts).set({ hearts, changedAt }).where(eq(schema.hearts.userId, userId));
  return toState({ ...row, hearts, changedAt }, now, false);
}

/** Adds hearts (practice refill, admin gift). Capped at max. */
export async function addHearts(
  db: Db,
  userId: string,
  amount: number,
  now = new Date(),
): Promise<HeartsState> {
  const [row, plus] = await Promise.all([loadRow(db, userId), hasPlus(db, userId, now)]);
  if (plus) return toState(row, now, true);
  const r = regen(row, now);
  const hearts = Math.min(HEARTS.max, r.hearts + Math.max(0, Math.floor(amount)));
  const changedAt = hearts >= HEARTS.max ? now : r.changedAt;
  await db.update(schema.hearts).set({ hearts, changedAt }).where(eq(schema.hearts.userId, userId));
  return toState({ ...row, hearts, changedAt }, now, false);
}

/**
 * One review rating counts towards a practice refill: every
 * `practicePerHeart` ratings give a heart back. Returns the new state and
 * whether a heart was just earned, so the UI can celebrate it.
 */
export async function practiceTick(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<{ state: HeartsState; earned: boolean }> {
  const [row, plus] = await Promise.all([loadRow(db, userId), hasPlus(db, userId, now)]);
  if (plus) return { state: toState(row, now, true), earned: false };
  const count = row.practiceCount + 1;
  if (count < HEARTS.practicePerHeart) {
    await db
      .update(schema.hearts)
      .set({ practiceCount: count })
      .where(eq(schema.hearts.userId, userId));
    return { state: toState({ ...row, practiceCount: count }, now, false), earned: false };
  }
  const r = regen(row, now);
  const hearts = Math.min(HEARTS.max, r.hearts + 1);
  const changedAt = hearts >= HEARTS.max ? now : r.changedAt;
  await db
    .update(schema.hearts)
    .set({ hearts, changedAt, practiceCount: 0 })
    .where(eq(schema.hearts.userId, userId));
  return {
    state: toState({ hearts, changedAt, practiceCount: 0 }, now, false),
    earned: r.hearts < HEARTS.max,
  };
}
