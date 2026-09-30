import { leagueName, type LeagueProfile, type LeagueProfileRequest } from "@molo/core";
import { and, eq } from "drizzle-orm";

import type { Db } from "../client.ts";
import { leagueMembers, users } from "../schema/index.ts";

export async function getLeagueProfile(db: Db, userId: string): Promise<LeagueProfile> {
  const [user] = await db
    .select({
      name: users.name,
      displayName: users.displayName,
      leaguesOptOut: users.leaguesOptOut,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new Error("user not found");
  return {
    displayName: user.displayName,
    leaguesOptOut: user.leaguesOptOut,
    publicName: leagueName(user.name, user.displayName),
  };
}

/** Updating the user locks the same row as league assignment, preventing a late rejoin. */
export async function setLeagueProfile(
  db: Db,
  userId: string,
  profile: LeagueProfileRequest,
  weekStart: string,
) {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(users.id, userId));
    if (profile.leaguesOptOut) {
      await tx
        .delete(leagueMembers)
        .where(and(eq(leagueMembers.userId, userId), eq(leagueMembers.weekStart, weekStart)));
    }
  });
  return getLeagueProfile(db, userId);
}
