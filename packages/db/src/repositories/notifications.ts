import type { MemberNotification } from "@molo/core";
import { and, asc, count, eq, gt, isNull, or } from "drizzle-orm";

import type { Db } from "../client.ts";
import { accounts, users } from "../schema/auth.ts";
import { userPrefs } from "../schema/learners.ts";
import { entitlements } from "../schema/monetisation.ts";

/** A snapshot, not a sequence: simultaneous completions may share the same number. */
export async function completedAccountCount(db: Db): Promise<number> {
  const [row] = await db.select({ total: count() }).from(users).where(eq(users.agePending, false));
  // Older accounts predate ageOk; agePending is the API's completion boundary for them too.
  return row?.total ?? 0;
}

/** Only an age-approved new member can be announced. Never read their email. */
export async function completedMemberNotification(
  db: Db,
  userId: string,
): Promise<MemberNotification | null> {
  const [user] = await db
    .select({ name: users.name, sourceLang: userPrefs.sourceLang })
    .from(users)
    .leftJoin(userPrefs, eq(userPrefs.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.ageOk, true), eq(users.agePending, false)))
    .limit(1);
  if (!user) return null;
  const [account] = await db
    .select({ provider: accounts.providerId })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .orderBy(asc(accounts.createdAt), asc(accounts.id))
    .limit(1);
  return {
    name: user.name,
    memberNumber: await completedAccountCount(db),
    provider:
      account?.provider === "apple" || account?.provider === "google" ? account.provider : "email",
    sourceLang: user.sourceLang ?? "en",
  };
}

/** Read BEFORE applying the event; this intentionally offers only best-effort deduplication. */
export async function lastPlusEventId(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: entitlements.lastEventId })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.entitlement, "plus")))
    .limit(1);
  return row?.id ?? null;
}

/** Same active/expiry rule as planOf, including manual/promo grants and sandbox entitlements. */
export async function activePlusMemberCount(db: Db, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.entitlement, "plus"),
        eq(entitlements.active, true),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
      ),
    );
  return row?.total ?? 0;
}
