import {
  memberNotificationText,
  subscriptionNotificationText,
  type RevenueCatEvent,
} from "@molo/core";
import { activePlusMemberCount, completedMemberNotification, type Db } from "@molo/db";
import type { Context } from "hono";

import { afterResponse } from "./background.ts";
import type { AppEnv, Bindings } from "./env.ts";
import { postSlack } from "./slack.ts";

/** Shared completion notifier: used after upfront age approval and after the one-tap age step. */
export function announceCompletedMember(c: Context<AppEnv>, userId: string): void {
  afterResponse(c, "member notification", async () => {
    const member = await completedMemberNotification(c.get("db"), userId);
    if (member) await postSlack(c.env, memberNotificationText(member), "signups");
  });
}

/** Invoked inside waitUntil, after RevenueCat's entitlement changes have committed. */
export async function notifySubscription(
  env: Bindings,
  db: Db,
  event: RevenueCatEvent,
): Promise<void> {
  const text = subscriptionNotificationText(event, await activePlusMemberCount(db));
  if (text) await postSlack(env, text, "subscriptions");
}
