/**
 * Starting the audio worker when recordings wait (apps/api/src/scheduled.ts).
 *
 * The worker runs the native xh-audio binary, so it lives in GitHub Actions
 * (.github/workflows/audio-worker.yml), not here. Its own five-minute schedule
 * is best effort, and on 2026-09-27 GitHub left it idle for over three hours
 * while a tutor's 14 click takes waited. Cloudflare cron triggers do fire on
 * time, so this Worker looks at the queue every five minutes and, only when
 * something is waiting, asks GitHub to run the workflow now.
 *
 * It reads the queue's metrics and never the database: a five-minute cron
 * must not take a Postgres connection. The workflow's concurrency group keeps
 * one run at a time, so a dispatch while a run is busy just queues the next.
 */

import { audioBacklog, type BacklogSource } from "./audio-backlog.ts";

const DEFAULT_REPO = "hardmax-as/molo";
const WORKFLOW = "audio-worker.yml";

export type KickResult = "idle" | "unknown" | "no-token" | "started" | "failed";

export async function kickAudioWorker(
  env: { AUDIO_QUEUE: BacklogSource; GH_DISPATCH_TOKEN?: string; GH_REPOSITORY?: string },
  fetchFn: typeof fetch = fetch,
): Promise<KickResult> {
  const { waiting } = await audioBacklog(env.AUDIO_QUEUE);
  if (waiting === null) return "unknown";
  if (waiting === 0) return "idle";
  const token = env.GH_DISPATCH_TOKEN;
  if (!token) {
    console.log(
      `[audio-worker-kick] ${waiting} waiting; no GH_DISPATCH_TOKEN, left to the schedule`,
    );
    return "no-token";
  }
  const repo = env.GH_REPOSITORY ?? DEFAULT_REPO;
  const res = await fetchFn(
    `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "molo-api",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  );
  // 204 on success. The status is logged; the token never is.
  if (res.status === 204) {
    console.log(`[audio-worker-kick] ${waiting} waiting; worker started`);
    return "started";
  }
  console.warn(`[audio-worker-kick] ${waiting} waiting; dispatch refused with ${res.status}`);
  return "failed";
}
