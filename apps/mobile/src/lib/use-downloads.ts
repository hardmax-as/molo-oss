import { useSyncExternalStore } from "react";

import { runDownload, type DownloadStop } from "./download-logic.ts";
import { downloadPorts, removeDownload } from "./download-ports.ts";
import { listDownloads, type UnitDownload } from "./downloads.ts";

/**
 * The download of a unit as screen state: what is on the device, what is
 * arriving, and what went wrong. A module-level store rather than a context
 * because a download outlives the screen that started it — a learner starts
 * one on the unit page, walks back to the list, and the progress must still
 * be there.
 *
 * There is deliberately no "partly downloaded" state to render: a unit is
 * either arriving or done, and a stop of any kind puts it back to neither
 * (`download-logic.ts`).
 */

export interface ActiveDownload {
  readonly done: number;
  readonly total: number;
  readonly bytes: number;
}

export interface DownloadsSnapshot {
  readonly ready: ReadonlyMap<string, UnitDownload>;
  readonly active: ReadonlyMap<string, ActiveDownload>;
  readonly failed: ReadonlyMap<string, DownloadStop>;
}

export function downloadKey(slug: string, lang: string): string {
  return `${lang}.${slug}`;
}

const EMPTY: DownloadsSnapshot = { ready: new Map(), active: new Map(), failed: new Map() };

let snapshot: DownloadsSnapshot = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
/** Units the learner has asked to stop; polled between recordings. */
const cancelling = new Set<string>();

function publish(next: DownloadsSnapshot): void {
  snapshot = next;
  for (const listen of listeners) listen();
}

function withActive(key: string, value: ActiveDownload | null): void {
  const active = new Map(snapshot.active);
  if (value) active.set(key, value);
  else active.delete(key);
  publish({ ...snapshot, active });
}

function withFailure(key: string, reason: DownloadStop | null): void {
  const failed = new Map(snapshot.failed);
  if (reason) failed.set(key, reason);
  else failed.delete(key);
  publish({ ...snapshot, failed });
}

/** Re-read the index from the device. Cheap, and the only source of "ready". */
export async function refreshDownloads(): Promise<void> {
  const rows = await listDownloads();
  const ready = new Map<string, UnitDownload>();
  for (const row of rows) ready.set(downloadKey(row.slug, row.lang), row);
  loaded = true;
  publish({ ...snapshot, ready });
}

export function startDownload(slug: string, lang: string): Promise<void> {
  const key = downloadKey(slug, lang);
  if (snapshot.active.has(key)) return Promise.resolve();
  cancelling.delete(key);
  withFailure(key, null);
  withActive(key, { done: 0, total: 0, bytes: 0 });
  return runDownload(downloadPorts, {
    slug,
    lang,
    cancelled: () => cancelling.has(key),
    onProgress: (p) => withActive(key, { done: p.done, total: p.total, bytes: p.bytes }),
  }).then((outcome) => {
    cancelling.delete(key);
    withActive(key, null);
    // A cancel is the learner's own decision, so it is not an error to report.
    if (!outcome.ok && outcome.reason !== "cancelled") withFailure(key, outcome.reason);
    return refreshDownloads();
  });
}

export function cancelDownload(slug: string, lang: string): void {
  cancelling.add(downloadKey(slug, lang));
}

export function deleteDownload(slug: string, lang: string): Promise<void> {
  const key = downloadKey(slug, lang);
  cancelling.add(key);
  return removeDownload(slug, lang)
    .catch(() => undefined)
    .then(() => {
      withFailure(key, null);
      return refreshDownloads();
    });
}

export function dismissDownloadError(slug: string, lang: string): void {
  withFailure(downloadKey(slug, lang), null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) void refreshDownloads();
  return () => {
    listeners.delete(listener);
  };
}

export function useDownloads(): DownloadsSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
