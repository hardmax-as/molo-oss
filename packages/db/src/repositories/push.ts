/**
 * Device push tokens. The learner owns these rows: the app writes one when
 * streak reminders are switched on, refreshes it on every start, and deletes
 * it on sign-out. The nightly cron reads them; nothing else does.
 */

import type { PushPlatform } from "@molo/core";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Db } from "../client.ts";
import { pushTokens } from "../schema/learners.ts";

export interface PushTokenInput {
  readonly token: string;
  readonly platform: PushPlatform;
  readonly appVersion?: string | undefined;
}

/** The token's own metadata, without the token itself (GDPR export). */
export interface PushTokenMeta {
  readonly platform: string;
  readonly appVersion: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly disabledAt: Date | null;
}

/**
 * Registers or refreshes one device. Idempotent on the token: a re-register
 * moves the row to the current account, bumps `last_seen_at` and clears any
 * earlier `disabled_at`, because a token Expo hands out again is alive.
 */
export async function registerPushToken(
  db: Db,
  userId: string,
  input: PushTokenInput,
): Promise<void> {
  const now = new Date();
  const values = {
    userId,
    token: input.token,
    platform: input.platform,
    appVersion: input.appVersion ?? null,
    lastSeenAt: now,
    disabledAt: null,
  };
  await db
    .insert(pushTokens)
    .values(values)
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: {
        userId,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        lastSeenAt: now,
        disabledAt: null,
      },
    });
}

/** Sign-out: forgets this device, or every device of the learner when no token is given. */
export async function removePushTokens(
  db: Db,
  userId: string,
  token?: string | undefined,
): Promise<number> {
  const rows = await db
    .delete(pushTokens)
    .where(
      token
        ? and(eq(pushTokens.userId, userId), eq(pushTokens.token, token))
        : eq(pushTokens.userId, userId),
    )
    .returning({ id: pushTokens.id });
  return rows.length;
}

/**
 * Live tokens for the given learners, keyed by user id. Disabled devices are
 * left out, so the sender never pays for a token Expo already rejected.
 */
export async function enabledPushTokens(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, string[]>> {
  const byUser = new Map<string, string[]>();
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select({ userId: pushTokens.userId, token: pushTokens.token })
    .from(pushTokens)
    .where(and(inArray(pushTokens.userId, [...userIds]), isNull(pushTokens.disabledAt)));
  for (const r of rows) {
    const list = byUser.get(r.userId);
    if (list) list.push(r.token);
    else byUser.set(r.userId, [r.token]);
  }
  return byUser;
}

/**
 * Marks tokens the push service reported as gone (`DeviceNotRegistered`).
 * Rows stay so a reinstall can revive them; they simply stop being pushed to.
 */
export async function disablePushTokens(db: Db, tokens: readonly string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const rows = await db
    .update(pushTokens)
    .set({ disabledAt: new Date() })
    .where(and(inArray(pushTokens.token, [...tokens]), isNull(pushTokens.disabledAt)))
    .returning({ id: pushTokens.id });
  return rows.length;
}

/** What `GET /me/export` shows: which devices are registered, never the tokens themselves. */
export async function pushTokenMetaFor(db: Db, userId: string): Promise<PushTokenMeta[]> {
  return db
    .select({
      platform: pushTokens.platform,
      appVersion: pushTokens.appVersion,
      createdAt: pushTokens.createdAt,
      lastSeenAt: pushTokens.lastSeenAt,
      disabledAt: pushTokens.disabledAt,
    })
    .from(pushTokens)
    .where(eq(pushTokens.userId, userId));
}
