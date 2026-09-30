/**
 * The warm cache for recordings (docs/CACHING.md section 2.0), as decisions
 * over injected ports so Jest covers it without a filesystem or a network.
 * `audio-cache.ts` wires the real ports.
 *
 * What it is for: an exercise's clip should play the moment it appears, not
 * after a round trip. So when a lesson opens, the recordings of its next few
 * exercises are fetched ahead into the app's cache directory, and on Wi-Fi
 * the rest of the unit follows behind them. `AudioButton` plays the cached
 * file when there is one.
 *
 * What it is not: a download. Nothing here writes the index
 * `downloads.ts` keeps, so a unit is never marked "Downloaded" or claimed to
 * work with no signal because some of its clips happen to be warm — that
 * promise belongs to "download this unit" alone. The directory is the OS's
 * cache, which it may empty when space runs short; a clip that vanished is
 * fetched from the network, as it would have been anyway.
 *
 * The one rule: **a file under its real name is always a whole file.** A
 * recording is fetched under a temporary name and renamed only once it has
 * fully arrived, because on Android a failed download can leave half a file
 * behind (`File.downloadFileAsync`, expo-file-system 57), and half a clip
 * played as if it were the word is worse than a spinner.
 *
 * Written with `.then` rather than `async`/`await`, like download-logic.ts,
 * so the module loads in Jest under Bun's isolated layout (the library notes).
 */

export const TEMP_SUFFIX = ".part";

/** Roughly 10 MB of short Opus clips; the oldest go first beyond it. */
export const MAX_WARM_FILES = 500;

export interface WarmPorts {
  /** The local name a recording is kept under: the SHA-256 its URL ends in. */
  readonly nameOf: (url: string) => string;
  /** True when a whole file is already there under that name. */
  readonly has: (name: string) => boolean;
  /** Fetch the recording into a temporary file. May leave a partial file on failure. */
  readonly fetchTo: (url: string, tempName: string) => Promise<void>;
  /** Give a finished temporary file its real name. */
  readonly promote: (tempName: string, name: string) => Promise<void>;
  /** Delete a temporary file, whether or not it exists. */
  readonly discard: (tempName: string) => void;
}

/** Only a public recording on the network is worth warming: not a local file, not editor audio. */
export function warmable(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url) && !url.includes("b=private");
}

/**
 * Whether a connection is one where fetching a whole unit's audio ahead is
 * polite. expo-network 57 reports the kind of connection but not whether it
 * is metered, so Wi-Fi and Ethernet count as unmetered and everything else,
 * cellular and unknown included, does not.
 */
export function isUnmetered(type: string | null | undefined): boolean {
  return type === "WIFI" || type === "ETHERNET";
}

/**
 * What to delete when the cache is opened: every temporary file (a fetch
 * that never finished, from an earlier run), and the oldest whole files
 * beyond `max`.
 */
export function toPrune(
  entries: readonly { readonly name: string; readonly modified: number }[],
  max: number = MAX_WARM_FILES,
): string[] {
  const out: string[] = [];
  const whole: { name: string; modified: number }[] = [];
  for (const e of entries) {
    if (e.name.endsWith(TEMP_SUFFIX)) out.push(e.name);
    else whole.push({ name: e.name, modified: e.modified });
  }
  if (whole.length > max) {
    whole.sort((a, b) => a.modified - b.modified);
    for (const e of whole.slice(0, whole.length - max)) out.push(e.name);
  }
  return out;
}

export interface Warmer {
  /**
   * Queue recordings to fetch ahead. `first` puts them in front of anything
   * already waiting (the lesson the learner just opened, ahead of the rest
   * of the unit). Resolves when the queue has drained; never rejects.
   */
  warm: (urls: readonly string[], opts?: { readonly first?: boolean }) => Promise<void>;
  /** How many recordings are waiting, the one in flight not counted. */
  waiting: () => number;
}

/**
 * One recording at a time, for the same reason as a unit download: a phone
 * on a busy hotel wifi does better with one connection than with twenty, and
 * warming must never compete with the clip the learner is playing now.
 */
export function createWarmer(ports: WarmPorts): Warmer {
  const queue: string[] = [];
  let running: Promise<void> | null = null;

  const step = (): Promise<void> => {
    const url = queue.shift();
    if (url === undefined) {
      running = null;
      return Promise.resolve();
    }
    let name: string;
    try {
      name = ports.nameOf(url);
      if (ports.has(name)) return step();
    } catch {
      return step();
    }
    const temp = `${name}${TEMP_SUFFIX}`;
    return ports
      .fetchTo(url, temp)
      .then(() => ports.promote(temp, name))
      .catch(() => {
        // A failed or half-written fetch leaves no file under the real name.
        try {
          ports.discard(temp);
        } catch {
          /* an undeletable temporary file is pruned next time */
        }
      })
      .then(step);
  };

  return {
    warm(urls, opts) {
      const wanted: string[] = [];
      for (const url of urls) if (warmable(url) && !wanted.includes(url)) wanted.push(url);
      if (opts?.first) {
        for (const url of wanted) {
          const at = queue.indexOf(url);
          if (at >= 0) queue.splice(at, 1);
        }
        queue.unshift(...wanted);
      } else {
        for (const url of wanted) if (!queue.includes(url)) queue.push(url);
      }
      if (!running) running = step();
      return running;
    },
    waiting: () => queue.length,
  };
}
