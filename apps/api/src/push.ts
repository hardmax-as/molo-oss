import { createI18n, type UiLanguage } from "@molo/i18n";

import type { Bindings } from "./env.ts";

/** Expo's HTTP/2 push endpoint. Batches of at most 100 messages per request. */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_PUSH_BATCH = 100;

export interface Push {
  /** Expo push tokens. One message is delivered to each. */
  readonly to: readonly string[];
  readonly title: string;
  readonly body: string;
  /** Small payload the app reads on tap; keep it to routing hints. */
  readonly data?: Record<string, string> | undefined;
}

export interface PushResult {
  /** Tickets Expo accepted. Delivery itself is asynchronous and not confirmed here. */
  readonly sent: number;
  /** Tokens Expo reported as gone (`DeviceNotRegistered`); the caller disables them. */
  readonly unregistered: readonly string[];
}

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

/** Splits into request-sized batches; Expo asks for no more than 100 per call. */
export function batchTokens(tokens: readonly string[], size = EXPO_PUSH_BATCH): string[][] {
  const unique = [...new Set(tokens)];
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

/**
 * Reads one batch's tickets: how many Expo accepted, and which tokens are
 * dead. Tickets come back in the order the tokens were sent.
 */
export function readTickets(
  tokens: readonly string[],
  body: unknown,
): { sent: number; unregistered: string[] } {
  const tickets = (body as { data?: ExpoTicket[] } | null)?.data ?? [];
  let sent = 0;
  const unregistered: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status === "ok") {
      sent++;
      return;
    }
    const token = tokens[i];
    if (token && ticket.details?.error === "DeviceNotRegistered") unregistered.push(token);
  });
  return { sent, unregistered };
}

/**
 * Expo push when an access token is configured (preview/prod); otherwise the
 * message is logged and nothing leaves the Worker. Pushing costs nothing in
 * money but everything in trust, so a missing token is a dry run, never an
 * error — the same contract as `sendEmail`. Token values are never logged.
 */
export async function sendPush(env: Bindings, push: Push): Promise<PushResult> {
  const batches = batchTokens(push.to);
  if (batches.length === 0) return { sent: 0, unregistered: [] };
  if (!env.EXPO_ACCESS_TOKEN) {
    console.log(
      `[push dry-run] devices=${push.to.length} title=${JSON.stringify(push.title)} body=${JSON.stringify(push.body)}`,
    );
    return { sent: 0, unregistered: [] };
  }
  let sent = 0;
  const unregistered: string[] = [];
  for (const batch of batches) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: batch,
        title: push.title,
        body: push.body,
        sound: "default",
        channelId: "reminders",
        priority: "normal",
        ...(push.data ? { data: push.data } : {}),
      }),
    });
    if (!res.ok) throw new Error(`expo push: ${res.status} ${await res.text()}`);
    const read = readTickets(batch, await res.json());
    sent += read.sent;
    unregistered.push(...read.unregistered);
  }
  return { sent, unregistered };
}

// One i18next instance per language, reused across cron runs in the isolate.
const instances = new Map<UiLanguage, ReturnType<typeof createI18n>>();
function translator(lang: UiLanguage) {
  let i = instances.get(lang);
  if (!i) {
    i = createI18n(lang);
    instances.set(lang, i);
  }
  return i;
}

/**
 * The streak reminder as a notification, in the learner's UI language. The
 * copy lives in `packages/i18n`; this only picks it (the project rules: never
 * hard-code copy).
 */
export function streakReminderPush(input: {
  name: string;
  streak: number;
  sourceLang: UiLanguage;
}): { title: string; body: string } {
  const t = translator(input.sourceLang);
  return {
    title: t.t("notifications.streakReminder.title", { name: input.name }),
    body: t.t("notifications.streakReminder.body", { count: input.streak }),
  };
}
