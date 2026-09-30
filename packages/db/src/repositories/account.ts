/**
 * A learner's own data: export everything we hold about them, and delete
 * the account (GDPR articles 15, 17 and 20). Editorial rows an editor
 * created stay, with the actor reference cleared, because published
 * content belongs to the course; the person behind it is forgotten.
 */

import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";

import type { Db } from "../client.ts";
import * as schema from "../schema/index.ts";
import { pushTokenMetaFor } from "./push.ts";

export async function exportUserData(db: Db, userId: string): Promise<Record<string, unknown>> {
  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      ageOk: schema.users.ageOk,
      agePending: schema.users.agePending,
      country: schema.users.country,
      displayName: schema.users.displayName,
      leaguesOptOut: schema.users.leaguesOptOut,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const [
    prefs,
    roles,
    streak,
    hearts,
    xp,
    cards,
    log,
    leagues,
    entitlements,
    devices,
    mistakes,
    chests,
  ] = await Promise.all([
    db.select().from(schema.userPrefs).where(eq(schema.userPrefs.userId, userId)),
    db
      .select({ role: schema.userRoles.role })
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, userId)),
    db.select().from(schema.streaks).where(eq(schema.streaks.userId, userId)),
    db.select().from(schema.hearts).where(eq(schema.hearts.userId, userId)),
    db.select().from(schema.xpEvents).where(eq(schema.xpEvents.userId, userId)),
    db.select().from(schema.reviewCards).where(eq(schema.reviewCards.userId, userId)),
    db
      .select({ log: schema.reviewLog })
      .from(schema.reviewLog)
      .innerJoin(schema.reviewCards, eq(schema.reviewCards.id, schema.reviewLog.cardId))
      .where(eq(schema.reviewCards.userId, userId)),
    db.select().from(schema.leagueMembers).where(eq(schema.leagueMembers.userId, userId)),
    db
      .select({
        entitlement: schema.entitlements.entitlement,
        active: schema.entitlements.active,
        expiresAt: schema.entitlements.expiresAt,
        source: schema.entitlements.source,
        productId: schema.entitlements.productId,
      })
      .from(schema.entitlements)
      .where(eq(schema.entitlements.userId, userId)),
    pushTokenMetaFor(db, userId),
    db.select().from(schema.learnerMistakes).where(eq(schema.learnerMistakes.userId, userId)),
    db.select().from(schema.skillChests).where(eq(schema.skillChests.userId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    user: user ?? null,
    roles: roles.map((r) => r.role),
    prefs: prefs[0] ?? null,
    streak: streak[0] ?? null,
    hearts: hearts[0] ?? null,
    xpEvents: xp,
    reviewCards: cards,
    reviewLog: log.map((r) => r.log),
    leagues,
    entitlements,
    webPurchases: await db
      .select()
      .from(schema.webPurchases)
      .where(eq(schema.webPurchases.userId, userId)),
    /** Names this learner reported or hid in leagues. */
    leagueReports: await db
      .select({
        reportedName: schema.leagueReports.reportedName,
        createdAt: schema.leagueReports.createdAt,
        resolvedAt: schema.leagueReports.resolvedAt,
      })
      .from(schema.leagueReports)
      .where(eq(schema.leagueReports.reporterId, userId)),
    leagueHides: await db
      .select({ createdAt: schema.leagueHides.createdAt })
      .from(schema.leagueHides)
      .where(eq(schema.leagueHides.userId, userId)),
    /** Registered devices: which platform and when, never the push token itself. */
    pushDevices: devices,
    mistakes,
    /** End-of-skill chests taken, and what each granted. */
    skillChests: chests,
  };
}

/**
 * Deletes the account. Learner rows cascade through their foreign keys;
 * editorial references are cleared first so the course keeps its history.
 */
export async function deleteUserAccount(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Push tokens would cascade with the user row; deleting them first states
    // the intent, and keeps the device unreachable even if the cascade changes.
    await tx.delete(schema.pushTokens).where(eq(schema.pushTokens.userId, userId));
    for (const table of [
      schema.lexemes,
      schema.glosses,
      schema.sentences,
      schema.sentenceGlosses,
      schema.audioAssets,
      schema.exercises,
      schema.lessons,
      schema.skills,
      schema.units,
    ]) {
      await tx.update(table).set({ createdBy: null }).where(eq(table.createdBy, userId));
      await tx.update(table).set({ approvedBy: null }).where(eq(table.approvedBy, userId));
    }
    // A tutor who answered a request keeps the sentence; only the name goes.
    await tx
      .update(schema.sentenceRequests)
      .set({ createdBy: null })
      .where(eq(schema.sentenceRequests.createdBy, userId));
    await tx
      .update(schema.sentenceRequests)
      .set({ fulfilledBy: null })
      .where(eq(schema.sentenceRequests.fulfilledBy, userId));
    await tx
      .update(schema.contentRevisions)
      .set({ actorId: null })
      .where(eq(schema.contentRevisions.actorId, userId));
    await tx
      .update(schema.reviewAssignments)
      .set({ assignedTo: null })
      .where(eq(schema.reviewAssignments.assignedTo, userId));
    await tx
      .update(schema.userRoles)
      .set({ grantedBy: null })
      .where(eq(schema.userRoles.grantedBy, userId));
    await tx
      .delete(schema.webPurchases)
      .where(and(eq(schema.webPurchases.userId, userId), isNull(schema.webPurchases.purchasedAt)));
    await tx.delete(schema.users).where(eq(schema.users.id, userId));
  });
}

/** True while a one-tap social sign-up still owes its age declaration. */
export async function isAgePending(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ agePending: schema.users.agePending })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.agePending === true;
}

/**
 * Records an accepted age declaration: eligibility and the validated country,
 * exactly what e-mail sign-up stores. The birth year never reaches this layer.
 * Only a pending account changes, so a replay cannot rewrite an older answer.
 */
export async function confirmPendingAge(
  db: Db,
  userId: string,
  country: "NO" | "ZA" | "OTHER",
): Promise<boolean> {
  const rows = await db
    .update(schema.users)
    .set({ ageOk: true, agePending: false, country, updatedAt: new Date() })
    .where(and(eq(schema.users.id, userId), eq(schema.users.agePending, true)))
    .returning({ id: schema.users.id });
  return rows.length === 1;
}

/**
 * The token columns of a user's Sign in with Apple accounts, read before the
 * account is deleted so the grant can be revoked at Apple. Never logged.
 */
export async function appleAccountTokens(
  db: Db,
  userId: string,
): Promise<{ refreshToken: string | null; accessToken: string | null; idToken: string | null }[]> {
  return db
    .select({
      refreshToken: schema.accounts.refreshToken,
      accessToken: schema.accounts.accessToken,
      idToken: schema.accounts.idToken,
    })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "apple")));
}

/**
 * Stores the tokens from exchanging a native Sign in with Apple authorization
 * code on the user's Apple account whose subject is `appleSubject`. Better
 * Auth's native id-token sign-in keeps no refresh token, so without this
 * deletion would have nothing to revoke. False when no such account exists.
 */
export async function storeAppleTokens(
  db: Db,
  userId: string,
  appleSubject: string,
  tokens: {
    refreshToken: string;
    accessToken: string | null;
    idToken: string | null;
    accessTokenExpiresAt: Date | null;
  },
): Promise<boolean> {
  const rows = await db
    .update(schema.accounts)
    .set({
      refreshToken: tokens.refreshToken,
      ...(tokens.accessToken ? { accessToken: tokens.accessToken } : {}),
      ...(tokens.idToken ? { idToken: tokens.idToken } : {}),
      ...(tokens.accessTokenExpiresAt ? { accessTokenExpiresAt: tokens.accessTokenExpiresAt } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.accounts.userId, userId),
        eq(schema.accounts.providerId, "apple"),
        eq(schema.accounts.accountId, appleSubject),
      ),
    )
    .returning({ id: schema.accounts.id });
  return rows.length > 0;
}

/** How many of these users hold an Apple account with a token to revoke. A count, never ids. */
export async function countAppleTokenHolders(db: Db, userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const rows = await db
    .selectDistinct({ userId: schema.accounts.userId })
    .from(schema.accounts)
    .where(
      and(
        inArray(schema.accounts.userId, [...userIds]),
        eq(schema.accounts.providerId, "apple"),
        or(isNotNull(schema.accounts.refreshToken), isNotNull(schema.accounts.accessToken)),
      ),
    );
  return rows.length;
}

/**
 * One-tap sign-ups that never answered the age step and were created before
 * `cutoff`: their ids, for deletion through the account-deletion path. Only
 * ids leave this function; no name or e-mail.
 */
export async function staleAgePendingUserIds(db: Db, cutoff: Date): Promise<string[]> {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.agePending, true), lt(schema.users.createdAt, cutoff)));
  return rows.map((r) => r.id);
}
