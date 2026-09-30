import { Directory, File, Paths } from "expo-file-system";

import { getUnit } from "./api.ts";
import { classifyFailure, downloadFailure, type DownloadPorts } from "./download-logic.ts";
import { forgetDownload, localFiles, saveDownload } from "./downloads.ts";
import { cacheUnit } from "./offline.ts";

/**
 * The native side of "download this unit": the filesystem, the API and the
 * on-device index. Kept apart from `download-logic.ts` so the state machine
 * runs in Jest with no device (the same split as push-logic / push-ports).
 *
 * Recordings go in one shared directory under the app's documents, named by
 * the file's own SHA-256 — which is what the URL already is, since audio
 * became content-addressed and immutable (docs/CACHING.md section 2.3). Two
 * units that teach the same word therefore share one file, a word already on
 * the device costs nothing to "download" again, and a recording an editor
 * replaces has a different name and is simply fetched.
 *
 * Documents rather than cache, deliberately: iOS evicts the cache directory
 * under storage pressure, and a unit that vanishes in the Kruger is the one
 * failure this feature exists to prevent.
 */

const DIRECTORY = "molo-audio";

export function audioDirectory(): Directory {
  return new Directory(Paths.document, DIRECTORY);
}

/**
 * The local name for a remote recording: the URL's last segment, with
 * anything that is not a plain filename character removed. The segment is a
 * SHA-256 and an extension, so this is a no-op in practice and a guard
 * against a path escaping the directory if that ever changes.
 */
export function fileNameOf(url: string): string {
  const path = url.split("?")[0] ?? url;
  const last = path.split("/").pop() ?? "";
  const safe = last.replace(/[^A-Za-z0-9._-]/g, "");
  return safe.replace(/^\.+/, "") || "audio.opus";
}

export function localPathOf(url: string): string {
  return new File(audioDirectory(), fileNameOf(url)).uri;
}

function ensureDirectory(): void {
  const dir = audioDirectory();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

export const downloadPorts: DownloadPorts = {
  fetchUnit: (slug, lang) => getUnit(slug, lang),

  freeBytes: () => {
    try {
      const free = Paths.availableDiskSpace;
      return Promise.resolve(typeof free === "number" && free >= 0 ? free : null);
    } catch {
      // Some platforms decline to say. `hasRoomFor` reads null as "go ahead",
      // and a real ENOSPC part way through is caught where it happens.
      return Promise.resolve(null);
    }
  },

  saveAudio: (_slug, _lang, url) => {
    try {
      ensureDirectory();
    } catch (e) {
      return Promise.reject(downloadFailure(classifyFailure(e)));
    }
    const target = new File(audioDirectory(), fileNameOf(url));
    // Already here because another unit needed it: nothing to pay for.
    if (target.exists) return Promise.resolve(target.size ?? 0);
    return File.downloadFileAsync(url, target, { idempotent: true }).then(
      (file) => file.size ?? 0,
      (e: unknown) => Promise.reject(downloadFailure(classifyFailure(e))),
    );
  },

  commit: (record) => {
    const files = new Map<string, string>();
    for (const url of record.urls) files.set(url, localPathOf(url));
    // The payload first, the claim last: a device that dies between them has
    // a cached unit and no promise, which is the harmless way round.
    return cacheUnit(record.slug, record.lang, record.unit).then(() =>
      saveDownload(
        {
          slug: record.slug,
          lang: record.lang,
          bytes: record.bytes,
          files: files.size,
          at: record.at,
        },
        files,
      ),
    );
  },

  discard: (slug, lang) => removeDownload(slug, lang),
};

/**
 * Remove a unit's download: the claim, the file list, and any recording no
 * other downloaded unit still needs. Safe to call for a unit that was never
 * downloaded, which is what makes it the machine's `discard` too.
 */
export function removeDownload(slug: string, lang: string): Promise<void> {
  return forgetDownload(slug, lang).then((orphans) => {
    for (const path of orphans) {
      try {
        const file = new File(path);
        if (file.exists) file.delete();
      } catch {
        /* an undeletable file is wasted space, not a failure to report */
      }
    }
    return undefined;
  });
}

/** The downloaded recordings for a unit, for `localiseUnit`. */
export function downloadedFiles(slug: string, lang: string): Promise<Map<string, string>> {
  return localFiles(slug, lang);
}
