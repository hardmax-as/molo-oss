/**
 * Report and hide for league names (Apple guideline 1.2, user-generated
 * content). Only a member of the same league this week can be reported or
 * hidden, so an id cannot be used to probe accounts outside the learner's
 * own table. A report also hides the name for the reporter.
 */

import { and, eq } from "drizzle-orm";

import type { Db } from "../client.ts";
import { leagueHides, leagueMembers, leagueReports } from "../schema/index.ts";

/** While this many learners have an open report against someone, their name is held back everywhere. */
export const REPORTS_TO_HOLD_NAME = 3;

/** True when both learners are in the same league this week. */
export async function sharesLeague(
  db: Db,
  userId: string,
  otherUserId: string,
  weekStart: string,
): Promise<boolean> {
  if (userId === otherUserId) return false;
  const [mine] = await db
    .select({ leagueId: leagueMembers.leagueId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.userId, userId), eq(leagueMembers.weekStart, weekStart)))
    .limit(1);
  if (!mine) return false;
  const [theirs] = await db
    .select({ userId: leagueMembers.userId })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, mine.leagueId), eq(leagueMembers.userId, otherUserId)))
    .limit(1);
  return !!theirs;
}

export async function hideLeagueMember(db: Db, userId: string, hiddenUserId: string) {
  await db.insert(leagueHides).values({ userId, hiddenUserId }).onConflictDoNothing();
}

export async function unhideLeagueMember(db: Db, userId: string, hiddenUserId: string) {
  await db
    .delete(leagueHides)
    .where(and(eq(leagueHides.userId, userId), eq(leagueHides.hiddenUserId, hiddenUserId)));
}

/**
 * Stores the report (once per pair) and hides the name for the reporter.
 * Returns true for a new report, false when this learner had already
 * reported this name, so the caller alerts the operator once.
 */
export async function reportLeagueMember(
  db: Db,
  reporterId: string,
  reportedUserId: string,
  reportedName: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(leagueReports)
      .values({ reporterId, reportedUserId, reportedName })
      .onConflictDoNothing()
      .returning({ id: leagueReports.id });
    await tx
      .insert(leagueHides)
      .values({ userId: reporterId, hiddenUserId: reportedUserId })
      .onConflictDoNothing();
    return inserted.length > 0;
  });
}
