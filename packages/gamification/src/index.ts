/**
 * XP, streaks and levels (ARCHITECTURE section 4). This package decides
 * whether you show up; it never touches what is due. It writes `xp_events`
 * and `streaks` only, both append-only or derived, so totals can never drift.
 */

import { DEFAULT_DAILY_GOAL_XP, XP, levelForXp } from "@molo/core";
import { schema, type Db } from "@molo/db";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { hasPlus } from "./hearts.ts";
import { joinLeague, weekEndOf, weekStartOf } from "./leagues.ts";

export type XpReason =
  | "lesson"
  | "review"
  | "click_drill"
  | "speak"
  | "perfect_lesson"
  | "chest"
  | "adjustment";

/** Records XP. Amounts of zero or less are ignored, and nothing is ever subtracted. */
export async function awardXp(
  db: Db,
  userId: string,
  amount: number,
  reason: XpReason,
  ref?: { kind: string; id: string },
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await db.insert(schema.xpEvents).values({
    userId,
    amount: Math.round(amount),
    reason,
    refKind: ref?.kind ?? null,
    refId: ref?.id ?? null,
  });
  // First XP of the week seats the learner in a league; later calls are no-ops.
  await joinLeague(db, userId);
}

/** Local calendar date as YYYY-MM-DD. The client sends its own date so a midnight in Oslo is a midnight in Oslo. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return isoDate(d);
}

/**
 * Marks activity for `today`; extends the streak on consecutive days,
 * restarts it otherwise. Idempotent within a day. With Plus, one freeze per
 * ISO week covers a single missed day: the streak continues and the freeze
 * is spent. Free learners never have a freeze.
 */
export async function touchStreak(
  db: Db,
  userId: string,
  today: string,
  opts: { plus?: boolean } = {},
): Promise<{ current: number; longest: number; frozen: boolean; extended: boolean }> {
  const [row] = await db
    .select()
    .from(schema.streaks)
    .where(eq(schema.streaks.userId, userId))
    .limit(1);
  const week = weekStartOf(new Date(`${today}T00:00:00Z`));
  if (!row) {
    await db
      .insert(schema.streaks)
      .values({
        userId,
        current: 1,
        longest: 1,
        lastActiveDate: today,
        freezeCount: opts.plus ? 1 : 0,
        freezeWeek: opts.plus ? week : null,
      })
      .onConflictDoNothing();
    return { current: 1, longest: 1, frozen: false, extended: true };
  }
  // Already active today: the streak stands, but nothing moved on, so the
  // celebration sequence does not claim it did.
  if (row.lastActiveDate === today)
    return { current: row.current, longest: row.longest, frozen: false, extended: false };
  // Weekly top-up for Plus; a lapsed Plus loses the freeze.
  let freezeCount = opts.plus ? (row.freezeWeek === week ? row.freezeCount : 1) : 0;
  const freezeWeek = opts.plus ? week : row.freezeWeek;
  const yesterday = dayBefore(today);
  let current: number;
  let frozen = false;
  let lastFrozenDate = row.lastFrozenDate;
  if (row.lastActiveDate === yesterday) current = row.current + 1;
  else if (row.lastActiveDate === dayBefore(yesterday) && freezeCount > 0) {
    // Exactly one day missed and a freeze in hand: the streak survives.
    current = row.current + 1;
    freezeCount -= 1;
    frozen = true;
    lastFrozenDate = yesterday;
  } else current = 1;
  const longest = Math.max(row.longest, current);
  await db
    .update(schema.streaks)
    .set({
      current,
      longest,
      lastActiveDate: today,
      freezeCount,
      freezeWeek,
      lastFrozenDate,
      updatedAt: new Date(),
    })
    .where(eq(schema.streaks.userId, userId));
  return { current, longest, frozen, extended: true };
}

/**
 * Which days of the learner's current week carry activity, Monday first,
 * for the streak beat's week strip (docs/DESIGN.md "After a lesson").
 * Activity is an `xp_events` row; `today` is the client's local date, and
 * days are bucketed the same way `progress()` buckets "today", so the two
 * numbers never disagree with each other.
 */
export async function activeWeek(
  db: Db,
  userId: string,
  today: string,
): Promise<{ week: boolean[]; todayIndex: number }> {
  const weekStart = weekStartOf(new Date(`${today}T00:00:00Z`));
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${weekEndOf(weekStart)}T00:00:00Z`);
  const rows = await db
    .select({ createdAt: schema.xpEvents.createdAt })
    .from(schema.xpEvents)
    .where(
      and(
        eq(schema.xpEvents.userId, userId),
        gte(schema.xpEvents.createdAt, start),
        lt(schema.xpEvents.createdAt, end),
      ),
    );
  const week = [false, false, false, false, false, false, false];
  const dayOf = (iso: string) =>
    Math.floor((new Date(`${iso}T00:00:00Z`).getTime() - start.getTime()) / 86_400_000);
  for (const r of rows) {
    const i = dayOf(isoDate(r.createdAt));
    if (i >= 0 && i < 7) week[i] = true;
  }
  const todayIndex = Math.min(6, Math.max(0, dayOf(today)));
  // The lesson that triggered this call is today's activity, whether or not
  // it earned any XP.
  week[todayIndex] = true;
  return { week, todayIndex };
}

/**
 * Of the given lessons, the ones this learner finished without a wrong
 * answer, read from the `perfect_lesson` XP events. A unit whose every
 * lesson is in this set earns the higher celebration tier.
 */
export async function perfectLessonIds(
  db: Db,
  userId: string,
  lessonIds: readonly string[],
): Promise<Set<string>> {
  if (lessonIds.length === 0) return new Set();
  const rows = await db
    .select({ refId: schema.xpEvents.refId })
    .from(schema.xpEvents)
    .where(
      and(
        eq(schema.xpEvents.userId, userId),
        eq(schema.xpEvents.refKind, "lesson"),
        eq(schema.xpEvents.reason, "perfect_lesson"),
        inArray(schema.xpEvents.refId, [...lessonIds]),
      ),
    );
  return new Set(rows.map((r) => r.refId).filter((x): x is string => !!x));
}

export interface Progress {
  readonly xpTotal: number;
  readonly level: number;
  readonly xpToday: number;
  readonly dailyGoalXp: number;
  readonly streak: {
    readonly current: number;
    readonly longest: number;
    readonly lastActiveDate: string | null;
    /** A Plus freeze is in hand for this week. */
    readonly freezeAvailable: boolean;
    readonly lastFrozenDate: string | null;
  };
}

/** Totals derived from the append-only log; nothing is stored as a counter. */
export async function progress(
  db: Db,
  userId: string,
  today: string,
  tzOffsetMinutes = 0,
): Promise<Progress> {
  // `today` is the learner's local date, so their day began `tzOffsetMinutes`
  // after that date's UTC midnight. Without this, a learner east of UTC sees
  // no XP at all between local midnight and UTC midnight — the exact hours
  // someone finishes a lesson to keep a streak alive.
  const dayStart = new Date(Date.parse(`${today}T00:00:00Z`) + tzOffsetMinutes * 60_000);
  const plus = await hasPlus(db, userId);
  const week = weekStartOf(new Date(`${today}T00:00:00Z`));
  const [[total], [todayRow], [streak], [prefs]] = await Promise.all([
    db
      .select({ n: sql<number>`coalesce(sum(${schema.xpEvents.amount}), 0)::int` })
      .from(schema.xpEvents)
      .where(eq(schema.xpEvents.userId, userId)),
    db
      .select({ n: sql<number>`coalesce(sum(${schema.xpEvents.amount}), 0)::int` })
      .from(schema.xpEvents)
      .where(and(eq(schema.xpEvents.userId, userId), gte(schema.xpEvents.createdAt, dayStart))),
    db.select().from(schema.streaks).where(eq(schema.streaks.userId, userId)).limit(1),
    db
      .select({ dailyGoalXp: schema.userPrefs.dailyGoalXp })
      .from(schema.userPrefs)
      .where(eq(schema.userPrefs.userId, userId))
      .limit(1),
  ]);
  const xpTotal = total?.n ?? 0;
  return {
    xpTotal,
    level: levelForXp(xpTotal),
    xpToday: todayRow?.n ?? 0,
    dailyGoalXp: prefs?.dailyGoalXp ?? DEFAULT_DAILY_GOAL_XP,
    streak: {
      current: streak?.current ?? 0,
      longest: streak?.longest ?? 0,
      lastActiveDate: streak?.lastActiveDate ?? null,
      // Plus: one per week; not yet topped up this week counts as available.
      freezeAvailable: plus && (!streak || streak.freezeWeek !== week || streak.freezeCount > 0),
      lastFrozenDate: streak?.lastFrozenDate ?? null,
    },
  };
}

/**
 * Server-side XP for a completed lesson. The client reports counts, the
 * server does the arithmetic from the constants in @molo/core and caps it,
 * so a tampered client cannot mint XP.
 */
export function lessonXp(input: { correct: number; total: number; clickDrillCorrect?: number }): {
  xp: number;
  perfect: boolean;
} {
  const total = Math.max(0, Math.floor(input.total));
  const correct = Math.min(total, Math.max(0, Math.floor(input.correct)));
  const clicks = Math.min(correct, Math.max(0, Math.floor(input.clickDrillCorrect ?? 0)));
  const perfect = total > 0 && correct === total;
  const xp =
    (correct - clicks) * XP.correct +
    clicks * XP.clickDrillCorrect +
    (perfect ? XP.perfectLessonBonus : 0);
  return { xp, perfect };
}

/**
 * Lessons this learner has finished at least once, read from the
 * append-only `xp_events` (a lesson is credited exactly once per
 * completion, and `/me/import-progress` relies on the same fact). Used by
 * the unit prerequisite rule; nothing here reorders or drops due cards.
 */
export async function completedLessonIds(
  db: Db,
  userId: string,
  lessonIds: readonly string[],
): Promise<Set<string>> {
  if (lessonIds.length === 0) return new Set();
  const rows = await db
    .select({ refId: schema.xpEvents.refId })
    .from(schema.xpEvents)
    .where(
      and(
        eq(schema.xpEvents.userId, userId),
        eq(schema.xpEvents.refKind, "lesson"),
        inArray(schema.xpEvents.refId, [...lessonIds]),
      ),
    );
  return new Set(rows.map((r) => r.refId).filter((x): x is string => !!x));
}

/** XP for one review rating: nothing for "again", the standard amount otherwise. */
export function reviewXp(rating: 1 | 2 | 3 | 4): number {
  return rating === 1 ? 0 : XP.correct;
}

export * from "./leagues.ts";
export * from "./reminders.ts";
export * from "./hearts.ts";
export * from "./entitlements.ts";
