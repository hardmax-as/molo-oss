import type { AudioBacklog } from "@molo/core";

/** The part of a Queue binding this reads; `metrics()` arrived in 2026-04. */
export interface BacklogSource {
  metrics?: () => Promise<{
    backlogCount: number;
    oldestMessageTimestamp?: number | Date | null;
  }>;
}

/**
 * How many studio uploads are waiting for the audio worker, from the queue's
 * realtime metrics (a Queues read, no table). Local simulation and older
 * runtimes may not implement `metrics()`; any failure answers "unknown" so a
 * tutor is never shown a wrong number.
 */
export async function audioBacklog(queue: BacklogSource): Promise<AudioBacklog> {
  if (typeof queue.metrics !== "function") return { waiting: null, oldestAt: null };
  try {
    const m = await queue.metrics();
    const ts = m.oldestMessageTimestamp;
    const ms = ts instanceof Date ? ts.getTime() : typeof ts === "number" ? ts : 0;
    const waiting = Number.isFinite(m.backlogCount) ? Math.max(0, m.backlogCount) : null;
    return {
      waiting,
      oldestAt: waiting && ms > 0 ? new Date(ms).toISOString() : null,
    };
  } catch (e) {
    console.warn(`[audio-backlog] metrics unavailable: ${e instanceof Error ? e.message : e}`);
    return { waiting: null, oldestAt: null };
  }
}
