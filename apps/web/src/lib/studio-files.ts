/**
 * The pure half of the studio's file uploads (docs/EDITOR-GUIDE.md,
 * "Recording session"): a tutor who records in another app hands the studio
 * a folder of files named after what they say, and the studio matches them
 * to the queue before anything is sent. No DOM, so it is tested directly.
 */

/** What the file picker offers. `audio/*` alone hides .m4a and .flac in some browsers. */
export const AUDIO_FILE_ACCEPT = "audio/*,.wav,.m4a,.mp3,.flac,.ogg,.oga,.opus,.aac,.webm";

/**
 * The comparable form of a word or a file name: no accents or tone marks,
 * lower case, punctuation and underscores as spaces, spaces collapsed. The
 * same function runs on both sides, so "Molo.m4a", "molo.M4A" and "mólo.wav"
 * all find the item "molo".
 */
export function matchKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The file name without its last extension. */
export function stemOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export interface MatchableItem {
  readonly kind: string;
  readonly id: string;
  readonly text: string;
}

export type Unmatched<F> = {
  readonly file: F;
  /** none: no item has the name; ambiguous: several do; duplicate: another file took the item. */
  readonly reason: "none" | "ambiguous" | "duplicate";
};

export interface FileMatches<F, I> {
  readonly matched: readonly { readonly file: F; readonly item: I }[];
  readonly unmatched: readonly Unmatched<F>[];
}

/**
 * Pairs each file with the one item whose text is its name. A name two
 * items share is never guessed at, and an item is given one file at most:
 * the tutor sorts those out one by one with "Use a file".
 */
export function matchFiles<F extends { readonly name: string }, I extends MatchableItem>(
  files: readonly F[],
  items: readonly I[],
): FileMatches<F, I> {
  const byKey = new Map<string, I[]>();
  for (const item of items) {
    const key = matchKey(item.text);
    if (key === "") continue;
    const list = byKey.get(key) ?? [];
    if (!list.some((i) => i.kind === item.kind && i.id === item.id)) list.push(item);
    byKey.set(key, list);
  }
  const matched: { file: F; item: I }[] = [];
  const unmatched: Unmatched<F>[] = [];
  const taken = new Set<string>();
  for (const file of files) {
    const candidates = byKey.get(matchKey(stemOf(file.name))) ?? [];
    if (candidates.length === 0) unmatched.push({ file, reason: "none" });
    else if (candidates.length > 1) unmatched.push({ file, reason: "ambiguous" });
    else {
      const item = candidates[0] as I;
      const id = `${item.kind}:${item.id}`;
      if (taken.has(id)) unmatched.push({ file, reason: "duplicate" });
      else {
        taken.add(id);
        matched.push({ file, item });
      }
    }
  }
  return { matched, unmatched };
}

const EXT_BY_MIME: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/webm": "webm",
};

/** The extension the upload is named with: the file's own when it has one, else from its type. */
export function extensionFor(mime: string, name?: string | undefined): string {
  const own = name ? /\.([A-Za-z0-9]{2,5})$/.exec(name)?.[1] : undefined;
  if (own) return own.toLowerCase();
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXT_BY_MIME[base] ?? (base.includes("mp4") ? "m4a" : "webm");
}
