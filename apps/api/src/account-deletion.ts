import { agePendingCutoff } from "@molo/core";
import {
  appleAccountTokens,
  deleteUserAccount,
  isAgePending,
  staleAgePendingUserIds,
  type Db,
} from "@molo/db";

import { revokeAppleTokens, type AppleRevokeOutcome, type Fetch } from "./apple.ts";
import type { Bindings } from "./env.ts";

/**
 * The one way an account is deleted from the API: "Delete account", the age
 * step below the minimum age, and the nightly cleanup of abandoned one-tap
 * sign-ups all come through here.
 *
 * The Apple tokens are read and revoked first, because the account rows that
 * hold them go with the user. Apple being slow or down never blocks the
 * deletion: revocation has a short deadline and only logs its failures.
 */
export async function deleteAccount(
  db: Db,
  env: Bindings,
  userId: string,
  fetchImpl: Fetch = fetch,
): Promise<AppleRevokeOutcome> {
  let apple: AppleRevokeOutcome = {
    revoked: 0,
    failed: 0,
    skipped: 0,
    withoutToken: 0,
    withoutClient: 0,
    failures: [],
  };
  try {
    const rows = await appleAccountTokens(db, userId);
    if (rows.length > 0) apple = await revokeAppleTokens(rows, env, fetchImpl);
  } catch (e) {
    console.warn(`auth.apple_revoke_failed reason=${e instanceof Error ? e.name : "unknown"}`);
  }
  await deleteUserAccount(db, userId);
  return apple;
}

/**
 * Deletes the one-tap sign-ups that never answered the age step within the
 * retention the privacy policy states (seven days). One account's failure
 * does not stop the rest. Returns counts only.
 */
export async function pruneAgePendingAccounts(
  db: Db,
  env: Bindings,
  now: Date,
  fetchImpl: Fetch = fetch,
): Promise<{ deleted: number; failed: number }> {
  const ids = await staleAgePendingUserIds(db, agePendingCutoff(now));
  let deleted = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      // Re-read: an account that answered the step since the list was taken stays.
      if (!(await isAgePending(db, id))) continue;
      await deleteAccount(db, env, id, fetchImpl);
      deleted++;
    } catch (e) {
      failed++;
      console.warn(
        `[cron] age-pending account not deleted: ${e instanceof Error ? e.name : "unknown"}`,
      );
    }
  }
  return { deleted, failed };
}
