/**
 * Cron handler (wrangler `triggers.crons`). One five-minute trigger; the time
 * of the tick picks the jobs (`dueJobs`):
 *
 *   17:00 UTC    nightly  — delete one-tap sign-ups that never answered the age step
 *                           within seven days, finalise leagues whose week is over,
 *                           send streak reminders
 *   Mon 08:00    weekly   — post the content report to Slack (Monday morning)
 *   every 5 min  audio    — start the GitHub audio worker when recordings wait
 *                           (audio-worker-kick.ts); never opens a database connection
 *
 * Every sender is a dry run (a log line) until its credential exists —
 * Resend for email, Expo for push, the Slack webhook for the report — so
 * either handler is safe to run in every environment.
 */

import { formatContentReport } from "@molo/core";
import { contentReport, createDb, disablePushTokens, enabledPushTokens, type Db } from "@molo/db";
import { finalizeDueLeagues, reminderCandidates, reminderEmail } from "@molo/gamification";

import { pruneAgePendingAccounts } from "./account-deletion.ts";
import { kickAudioWorker } from "./audio-worker-kick.ts";
import { sendEmail } from "./email.ts";
import type { Bindings } from "./env.ts";
import { sendPush, streakReminderPush } from "./push.ts";
import { postSlack } from "./slack.ts";

/**
 * The Worker's only cron trigger (apps/api/wrangler.jsonc, infra/alchemy.run.ts).
 * The account's plan allows five triggers across every Worker and other
 * projects use three, so one five-minute trigger carries all of molo's jobs
 * and the time of the tick says which: 17:00 UTC the nightly work, Monday
 * 08:00 UTC the content report, every tick the audio-worker check.
 */
export const CRON = "*/5 * * * *";

export type CronEvent = { readonly cron: string; readonly scheduledTime: number };

/** Which database jobs a tick owes. A tick is five minutes, so `< 5` fires once. */
export function dueJobs(at: Date): { readonly nightly: boolean; readonly weekly: boolean } {
  const h = at.getUTCHours();
  const m = at.getUTCMinutes();
  return {
    nightly: h === 17 && m < 5,
    weekly: at.getUTCDay() === 1 && h === 8 && m < 5,
  };
}

export async function scheduled(event: ScheduledController, env: Bindings): Promise<void> {
  // Every tick, and before any database connection is opened.
  await kickAudioWorker(env).catch((e: unknown) =>
    console.warn(`[audio-worker-kick] failed: ${e instanceof Error ? e.message : "unknown"}`),
  );
  const due = dueJobs(new Date(event.scheduledTime));
  if (!due.nightly && !due.weekly) return;
  const { db, close } = createDb(env.HYPERDRIVE.connectionString, { max: 1, prepare: false });
  try {
    await runCron(db, env, event);
  } finally {
    await close();
  }
}

/** The jobs a tick owes, with the database handed in so they can be exercised in a test. */
export async function runCron(db: Db, env: Bindings, event: CronEvent): Promise<void> {
  const now = new Date(event.scheduledTime);
  const due = dueJobs(now);
  if (due.weekly) await weeklyReport(db, env, now, "weekly");
  if (due.nightly) await nightly(db, env, now, "nightly");
}

async function nightly(db: Db, env: Bindings, now: Date, cron: string): Promise<void> {
  // First and on its own: the retention the privacy policy promises must not
  // depend on the reminders, and a failure here must not cost the reminders.
  try {
    const pruned = await pruneAgePendingAccounts(db, env, now);
    console.log(
      `[cron ${cron}] age-pending accounts deleted: ${pruned.deleted}; failed: ${pruned.failed}`,
    );
  } catch (e) {
    console.warn(
      `[cron ${cron}] age-pending cleanup failed: ${e instanceof Error ? e.name : "unknown"}`,
    );
  }
  const finalised = await finalizeDueLeagues(db, now);
  const today = now.toISOString().slice(0, 10);
  const candidates = await reminderCandidates(db, today);
  const devices = await enabledPushTokens(
    db,
    candidates.map((c) => c.userId),
  );
  let sent = 0;
  let pushed = 0;
  const dead: string[] = [];
  for (const c of candidates) {
    const mail = reminderEmail(c, env.WEB_ORIGIN);
    const r = await sendEmail(env, { to: c.email, ...mail });
    if (r.sent) sent++;
    const tokens = devices.get(c.userId);
    if (!tokens || tokens.length === 0) continue;
    try {
      // The tap opens the review tab; the app only follows routes it knows.
      const push = await sendPush(env, {
        to: tokens,
        ...streakReminderPush({ name: c.name, streak: c.streak, sourceLang: c.sourceLang }),
        data: { route: "/review" },
      });
      pushed += push.sent;
      dead.push(...push.unregistered);
    } catch (e) {
      // One learner's push must not cost everyone else their reminder.
      console.warn(`[cron] push failed for one learner: ${e instanceof Error ? e.message : e}`);
    }
  }
  const disabled = await disablePushTokens(db, dead);
  console.log(
    `[cron ${cron}] leagues finalised: ${finalised}; reminder candidates: ${candidates.length}; emails sent: ${sent}${env.RESEND_API_KEY ? "" : " (dry run, no RESEND_API_KEY)"}; pushes sent: ${pushed}${env.EXPO_ACCESS_TOKEN ? "" : " (dry run, no EXPO_ACCESS_TOKEN)"}; tokens disabled: ${disabled}`,
  );
}

/**
 * Monday morning: the same numbers `molo content report` prints, posted to
 * the editors' channel. Counts only — no learner is named, and the webhook
 * URL never reaches a log.
 */
async function weeklyReport(db: Db, env: Bindings, now: Date, cron: string): Promise<void> {
  const report = await contentReport(db, now);
  const text = formatContentReport(report);
  const { posted } = await postSlack(env, text);
  console.log(
    `[cron ${cron}] content report ${posted ? "posted to Slack" : "not posted (no SLACK_WEBHOOK_URL)"}; review queue: ${report.blockers.reviewQueue}`,
  );
}
