/**
 * "Download this unit" as decisions over injected ports, so Jest covers the
 * whole state machine — including every way it can fail half way — without
 * a filesystem, a network or a device. `src/lib/download-ports.ts` wires the
 * real ports; nothing here imports a native module.
 *
 * The chains are written with `.then` rather than `async`/`await`, and
 * nothing here destructures an array, on purpose: `@babel/runtime` is not
 * resolvable from apps/mobile under Bun's isolated layout, and both
 * constructs make Babel reach for a helper from it, so a module using them
 * fails to load in Jest (the library notes).
 *
 * Why this exists at all: the expected South African audience are visitors
 * on a two or three week trip, with expensive data and long stretches of no
 * signal in the Kruger, the Karoo or on the road. A lesson they cannot open
 * in a game reserve is worse than one that takes 300 ms to open in Cape
 * Town (docs/CACHING.md section 2.1).
 *
 * **The one rule.** A unit that did not finish downloading never claims to
 * be available offline. Every stop — cancelled, out of space, connection
 * lost, a recording that 404s — discards what was written and leaves the
 * unit exactly as it was. Half a unit in a reserve is a promise broken at
 * the worst possible moment.
 */

import type { AudioRef, UnitResponse } from "@molo/core";

/**
 * Opus voice at roughly 32 kbit/s, which is what `xh-audio` encodes to:
 * about 4 000 bytes a second. The estimate is shown to a learner before
 * they spend roaming data, so it is deliberately a slight over-estimate —
 * being told 3 MB and spending 2 is a good surprise, the other way round is
 * not.
 */
export const BYTES_PER_AUDIO_SECOND = 4_000;

/** What a clip of unknown length is assumed to cost: a longish word. */
export const UNKNOWN_CLIP_BYTES = 24_000;

/**
 * How much more than the estimate must be free before we start. Disks lie,
 * estimates are estimates, and running a phone to zero to save a word list
 * is not a trade anyone asked for.
 */
export const SPACE_HEADROOM = 1.5;

export type DownloadStop =
  | "cancelled"
  /** The network went away, or never was there. */
  | "offline"
  /** Not enough room on the device, either before starting or part way in. */
  | "no_space"
  /** A recording the unit needs is not there any more: a content bug, not the learner's. */
  | "missing_audio"
  /** Anything else. */
  | "failed";

export type DownloadOutcome =
  | { readonly ok: true; readonly files: number; readonly bytes: number }
  | { readonly ok: false; readonly reason: DownloadStop };

/** What a port throws so the machine can tell the failures apart. */
export type FailureKind = "missing" | "no_space" | "offline" | "failed";

export type DownloadFailure = Error & { readonly kind: FailureKind };

/**
 * A tagged error, built rather than subclassed: `class X extends Error`
 * makes Babel reach for `@babel/runtime`, which is not resolvable from
 * apps/mobile under Bun's isolated layout, and this module has to load in
 * Jest (the library notes).
 */
export function downloadFailure(kind: FailureKind): DownloadFailure {
  const e = new Error(kind) as Error & { kind: FailureKind };
  e.name = "DownloadFailure";
  e.kind = kind;
  return e;
}

/**
 * A 404 is a content problem and a full disk is the learner's, and the two
 * want different words on screen, so an unclassified error is read once,
 * here, rather than guessed at three call sites.
 */
export function classifyFailure(e: unknown): FailureKind {
  const tagged = (e as { kind?: unknown } | null)?.kind;
  if (
    tagged === "missing" ||
    tagged === "no_space" ||
    tagged === "offline" ||
    tagged === "failed"
  ) {
    return tagged;
  }
  const message = String((e as { message?: unknown })?.message ?? e).toLowerCase();
  if (/\b(404|403|410)\b|not found|unabletodownload/.test(message)) return "missing";
  if (/no space|enospc|disk full|not enough space/.test(message)) return "no_space";
  if (/network|offline|timed? ?out|connection|unreachable|failed to fetch/.test(message)) {
    return "offline";
  }
  return "failed";
}

export interface DownloadProgress {
  /** Files finished so far. */
  readonly done: number;
  /** Files this unit needs in total. */
  readonly total: number;
  /** Bytes actually written so far — measured, not estimated. */
  readonly bytes: number;
}

export interface DownloadPorts {
  /** The unit payload, straight from the API. Throws like any other fetch. */
  readonly fetchUnit: (slug: string, lang: string) => Promise<UnitResponse>;
  /** Free space on the device, or null when the platform will not say. */
  readonly freeBytes: () => Promise<number | null>;
  /**
   * Fetch one recording into the unit's own directory and answer with its
   * size on disk. The URL is content-addressed (its key is the file's own
   * SHA-256), so the local name can be taken from it and a file that is
   * already there is already right.
   */
  readonly saveAudio: (slug: string, lang: string, url: string) => Promise<number>;
  /** Remember the unit's payload and its files. Called once, at the end. */
  readonly commit: (record: DownloadRecord) => Promise<void>;
  /** Remove everything this unit wrote, whether or not it finished. */
  readonly discard: (slug: string, lang: string) => Promise<void>;
}

export interface DownloadRecord {
  readonly slug: string;
  readonly lang: string;
  readonly unit: UnitResponse;
  /** Every audio URL the unit needs, in the order they were fetched. */
  readonly urls: readonly string[];
  readonly bytes: number;
  readonly at: number;
}

/**
 * Every recording a unit needs: the exercises' own assets, the bare clicks a
 * click_identify plays, and the words and sentences they hydrate, each with all of its voices. Deduplicated by URL,
 * because one word appears in many exercises and the same file must not be
 * paid for twice.
 */
export function audioRefsOf(unit: UnitResponse): AudioRef[] {
  const byUrl = new Map<string, AudioRef>();
  const add = (ref: AudioRef | null | undefined) => {
    if (ref?.url) byUrl.set(ref.url, ref);
  };
  for (const ref of Object.values(unit.audioAssets)) add(ref);
  for (const ref of Object.values(unit.clickAudio ?? {})) add(ref);
  for (const lexeme of Object.values(unit.lexemes)) {
    add(lexeme.audio);
    for (const voice of lexeme.voices) add(voice);
  }
  for (const sentence of Object.values(unit.sentences)) {
    add(sentence.audio);
    for (const voice of sentence.voices) add(voice);
  }
  return [...byUrl.values()];
}

/** What the unit will cost, before a byte is spent. */
export function estimateBytes(refs: readonly AudioRef[]): number {
  let total = 0;
  for (const ref of refs) {
    const ms = typeof ref.durationMs === "number" && ref.durationMs > 0 ? ref.durationMs : 0;
    total += ms > 0 ? Math.round((ms / 1000) * BYTES_PER_AUDIO_SECOND) : UNKNOWN_CLIP_BYTES;
  }
  return total;
}

/** True when there is room for the estimate and its headroom. Unknown free space is a yes. */
export function hasRoomFor(estimate: number, free: number | null): boolean {
  return free === null || free >= estimate * SPACE_HEADROOM;
}

export interface DownloadRequest {
  readonly slug: string;
  readonly lang: string;
  /** Polled before every file, so a cancel takes effect within one recording. */
  readonly cancelled?: () => boolean;
  readonly onProgress?: (p: DownloadProgress) => void;
  readonly now?: () => number;
}

function stop(
  ports: DownloadPorts,
  req: DownloadRequest,
  reason: DownloadStop,
): Promise<DownloadOutcome> {
  // Discarding is best effort: a device that cannot delete is not a reason
  // to leave a half-written unit claiming to be ready, and the claim is a
  // separate record that is simply never written.
  return ports
    .discard(req.slug, req.lang)
    .catch(() => undefined)
    .then(() => ({ ok: false as const, reason }));
}

/**
 * Fetch a unit and every recording in it. Resolves either with what was
 * saved, or with the reason it stopped — never rejects, because a failure
 * here is a thing to tell the learner, not a crash.
 */
export function runDownload(ports: DownloadPorts, req: DownloadRequest): Promise<DownloadOutcome> {
  const cancelled = () => req.cancelled?.() === true;
  const now = req.now ?? (() => Date.now());
  if (cancelled()) return stop(ports, req, "cancelled");

  return ports
    .fetchUnit(req.slug, req.lang)
    .then((unit) => {
      const refs = audioRefsOf(unit);
      const total = refs.length;
      req.onProgress?.({ done: 0, total, bytes: 0 });
      if (cancelled()) return stop(ports, req, "cancelled");

      return ports
        .freeBytes()
        .catch(() => null)
        .then((free) => {
          if (!hasRoomFor(estimateBytes(refs), free)) return stop(ports, req, "no_space");

          const urls: string[] = [];
          let bytes = 0;

          // One at a time, on purpose. A phone on a hotel wifi that is
          // shared with forty other guests does better with one connection
          // than with twenty, the progress it reports is the truth rather
          // than an average, and a cancel lands within one recording.
          const step = (i: number): Promise<DownloadOutcome> => {
            if (cancelled()) return stop(ports, req, "cancelled");
            if (i >= total) {
              return ports
                .commit({ slug: req.slug, lang: req.lang, unit, urls, bytes, at: now() })
                .then(() => ({ ok: true as const, files: urls.length, bytes }))
                .catch((e: unknown) => stop(ports, req, stopFor(classifyFailure(e))));
            }
            const url = refs[i]?.url;
            if (!url) return step(i + 1);
            return ports.saveAudio(req.slug, req.lang, url).then(
              (written) => {
                urls.push(url);
                bytes += written;
                req.onProgress?.({ done: urls.length, total, bytes });
                return step(i + 1);
              },
              (e: unknown) => stop(ports, req, stopFor(classifyFailure(e))),
            );
          };

          return step(0);
        });
    })
    .catch((e: unknown) => stop(ports, req, stopFor(classifyFailure(e))));
}

function stopFor(kind: FailureKind): DownloadStop {
  return kind === "missing" ? "missing_audio" : kind;
}

/**
 * Swap every audio URL a unit carries for the copy on this device, where
 * there is one. The URLs are content-addressed, so a recording an editor
 * has replaced has a different URL, is not on the device, and falls back to
 * the network by itself — no staleness check, no version to get wrong.
 */
export function localiseUnit(unit: UnitResponse, files: ReadonlyMap<string, string>): UnitResponse {
  if (files.size === 0) return unit;
  const swap = <T extends AudioRef | null>(ref: T): T => {
    if (!ref) return ref;
    const local = files.get(ref.url);
    return (local ? { ...ref, url: local } : ref) as T;
  };
  const lexemes: Record<string, UnitResponse["lexemes"][string]> = {};
  for (const id of Object.keys(unit.lexemes)) {
    const lexeme = unit.lexemes[id];
    if (lexeme) {
      lexemes[id] = { ...lexeme, audio: swap(lexeme.audio), voices: lexeme.voices.map(swap) };
    }
  }
  const sentences: Record<string, UnitResponse["sentences"][string]> = {};
  for (const id of Object.keys(unit.sentences)) {
    const s = unit.sentences[id];
    if (s) sentences[id] = { ...s, audio: swap(s.audio), voices: s.voices.map(swap) };
  }
  const audioAssets: Record<string, AudioRef> = {};
  for (const id of Object.keys(unit.audioAssets)) {
    const ref = unit.audioAssets[id];
    if (ref) audioAssets[id] = swap(ref);
  }
  if (!unit.clickAudio) return { ...unit, lexemes, sentences, audioAssets };
  const clickAudio: Record<string, AudioRef> = {};
  for (const id of Object.keys(unit.clickAudio)) {
    const ref = unit.clickAudio[id];
    if (ref) clickAudio[id] = swap(ref);
  }
  return { ...unit, lexemes, sentences, audioAssets, clickAudio };
}

/** Bytes as the learner reads them. Two significant figures is honest enough for a size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${Math.max(0, Math.round(bytes))} B`;
  const mb = bytes / 1_000_000;
  if (mb < 1) return `${Math.round(bytes / 1000)} kB`;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
