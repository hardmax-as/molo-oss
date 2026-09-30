import type { Context } from "hono";

import type { AppEnv } from "./env.ts";

/** Call after deciding the response. Keep its DB alive, but never await delivery in the handler. */
export function afterResponse(
  c: Context<AppEnv>,
  label: string,
  work: () => Promise<unknown>,
): void {
  const task = Promise.resolve()
    .then(work)
    .then(() => undefined)
    .catch(() => {
      // An exception may contain a webhook URL or personal data; log the operation only.
      console.warn(`[background] ${label} failed`);
    });
  const pending = c.get("backgroundTasks") ?? [];
  pending.push(task);
  c.set("backgroundTasks", pending);
  try {
    c.executionCtx.waitUntil(task);
  } catch {
    console.warn(`[background] ${label}: execution context unavailable`);
  }
}
