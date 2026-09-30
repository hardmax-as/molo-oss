import { lessonAudioUrls, unitAudioUrls, type UnitResponse } from "@molo/core";
import { Directory, File, Paths } from "expo-file-system";
import { getNetworkStateAsync } from "expo-network";

import { createWarmer, isUnmetered, toPrune, warmable } from "./audio-cache-logic.ts";
import { fileNameOf } from "./download-ports.ts";

/**
 * The native side of the warm cache (`audio-cache-logic.ts` has the rules and
 * the reasons). Recordings land in the app's cache directory under their own
 * SHA-256, apart from the downloads in documents: this directory is the OS's
 * to empty, and nothing in it is a promise that a unit works offline.
 */

const DIRECTORY = "molo-audio-warm";

function directory(): Directory {
  return new Directory(Paths.cache, DIRECTORY);
}

let prepared = false;

/** Create the directory, and once per run clear leftovers and trim it to size. */
function prepare(): void {
  const dir = directory();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  if (prepared) return;
  prepared = true;
  try {
    const entries: { name: string; modified: number }[] = [];
    for (const entry of dir.list()) {
      if (entry instanceof File)
        entries.push({ name: entry.name, modified: entry.modificationTime ?? 0 });
    }
    for (const name of toPrune(entries)) {
      try {
        new File(dir, name).delete();
      } catch {
        /* wasted space, not a failure */
      }
    }
  } catch {
    /* an unreadable cache is simply not trimmed this time */
  }
}

const warmer = createWarmer({
  nameOf: fileNameOf,
  has: (name) => new File(directory(), name).exists,
  fetchTo: (url, temp) => {
    prepare();
    return File.downloadFileAsync(url, new File(directory(), temp), { idempotent: true }).then(
      () => undefined,
    );
  },
  promote: (temp, name) =>
    new File(directory(), temp).move(new File(directory(), name), { overwrite: true }),
  discard: (temp) => {
    const file = new File(directory(), temp);
    if (file.exists) file.delete();
  },
});

/**
 * The local copy of a recording when the warm cache holds a whole one, else
 * null. Synchronous and cheap (one file-exists check), so `AudioButton` can
 * ask while it renders.
 */
export function warmedUri(url: string | null | undefined): string | null {
  if (!warmable(url)) return null;
  try {
    const file = new File(directory(), fileNameOf(url));
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Fetch ahead the recordings of a lesson's next `count` exercises from
 * `from`, in front of anything else waiting: the learner is about to hear them.
 */
export function warmLesson(unit: UnitResponse, lessonId: string, from = 0, count = 3): void {
  void warmer.warm(lessonAudioUrls(unit, lessonId, from, count), { first: true });
}

/**
 * On Wi-Fi or Ethernet, queue every recording the unit's lessons play behind
 * whatever is already waiting. On cellular, or when the connection cannot be
 * told, nothing: a learner on roaming data pays for a clip when they play it,
 * not before.
 */
export function warmUnitWhenUnmetered(unit: UnitResponse): void {
  void getNetworkStateAsync()
    .then((state) => {
      if (state.isInternetReachable === false || !isUnmetered(state.type)) return undefined;
      return warmer.warm(unitAudioUrls(unit));
    })
    .catch(() => undefined);
}
