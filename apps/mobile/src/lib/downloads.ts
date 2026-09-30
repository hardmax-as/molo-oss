import AsyncStorage from "@react-native-async-storage/async-storage";

import { openDb } from "./db.ts";

/**
 * The index of what this device has downloaded (docs/CACHING.md section
 * 2.1): one row per unit that finished, and one row per recording it needs.
 * The payload itself lives in the `units` table that `offline.ts` already
 * writes.
 *
 * **A row here is a claim that the unit works with no signal at all.** It is
 * written once, at the end of a download, and never for a partial one —
 * `runDownload` in `download-logic.ts` discards instead. Nothing else in the
 * app may write it.
 *
 * Files are shared between units and stored by their own name, which is the
 * recording's SHA-256: a word that appears in two units is downloaded once,
 * and removing one unit deletes only the files no remaining unit still
 * needs. AsyncStorage is the fallback for a build without op-sqlite, exactly
 * as in `offline.ts`.
 */

const UNIT_PREFIX = "molo.download.";
const FILES_PREFIX = "molo.download.files.";

export interface UnitDownload {
  readonly slug: string;
  readonly lang: string;
  /** Bytes on disk, measured while downloading. */
  readonly bytes: number;
  readonly files: number;
  readonly at: number;
}

interface StoredFiles {
  readonly [url: string]: string;
}

function unitKey(slug: string, lang: string): string {
  return `${UNIT_PREFIX}${lang}.${slug}`;
}
function filesKey(slug: string, lang: string): string {
  return `${FILES_PREFIX}${lang}.${slug}`;
}

/** Every unit this device has a complete copy of, newest first. */
export async function listDownloads(): Promise<UnitDownload[]> {
  const db = await openDb();
  try {
    if (db) {
      const r = await db.execute(
        "SELECT slug, lang, bytes, files, updated_at FROM unit_downloads ORDER BY updated_at DESC",
      );
      return r.rows.map((row) => ({
        slug: String(row["slug"]),
        lang: String(row["lang"]),
        bytes: Number(row["bytes"] ?? 0),
        files: Number(row["files"] ?? 0),
        at: Number(row["updated_at"] ?? 0),
      }));
    }
    const keys = (await AsyncStorage.getAllKeys()).filter(
      (k) => k.startsWith(UNIT_PREFIX) && !k.startsWith(FILES_PREFIX),
    );
    const pairs = await AsyncStorage.multiGet(keys);
    const out: UnitDownload[] = [];
    for (const pair of pairs) {
      const raw = pair[1];
      if (raw) out.push(JSON.parse(raw) as UnitDownload);
    }
    return out.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function downloadedUnit(slug: string, lang: string): Promise<UnitDownload | null> {
  const all = await listDownloads();
  return all.find((d) => d.slug === slug && d.lang === lang) ?? null;
}

/** The recordings this unit has on disk: remote URL to local `file://` path. */
export async function localFiles(slug: string, lang: string): Promise<Map<string, string>> {
  const db = await openDb();
  try {
    if (db) {
      const r = await db.execute("SELECT url, path FROM unit_files WHERE slug = ? AND lang = ?", [
        slug,
        lang,
      ]);
      const map = new Map<string, string>();
      for (const row of r.rows) map.set(String(row["url"]), String(row["path"]));
      return map;
    }
    const raw = await AsyncStorage.getItem(filesKey(slug, lang));
    const stored = raw ? (JSON.parse(raw) as StoredFiles) : {};
    const map = new Map<string, string>();
    for (const url of Object.keys(stored)) {
      const path = stored[url];
      if (path) map.set(url, path);
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Written last, and only for a unit whose every recording arrived. */
export async function saveDownload(
  record: UnitDownload,
  files: ReadonlyMap<string, string>,
): Promise<void> {
  const db = await openDb();
  if (db) {
    await db.execute("DELETE FROM unit_files WHERE slug = ? AND lang = ?", [
      record.slug,
      record.lang,
    ]);
    for (const entry of files) {
      await db.execute(
        "INSERT OR REPLACE INTO unit_files (slug, lang, url, path) VALUES (?, ?, ?, ?)",
        [record.slug, record.lang, entry[0], entry[1]],
      );
    }
    await db.execute(
      "INSERT OR REPLACE INTO unit_downloads (slug, lang, bytes, files, updated_at) VALUES (?, ?, ?, ?, ?)",
      [record.slug, record.lang, record.bytes, record.files, record.at],
    );
    return;
  }
  const stored: Record<string, string> = {};
  for (const entry of files) stored[entry[0]] = entry[1];
  await AsyncStorage.setItem(filesKey(record.slug, record.lang), JSON.stringify(stored));
  await AsyncStorage.setItem(unitKey(record.slug, record.lang), JSON.stringify(record));
}

/**
 * Forget a unit's claim and its file list, and answer with the local paths
 * that no other downloaded unit still needs — the caller deletes those.
 * Order matters: the claim goes first, so a device that dies mid-delete is
 * left with orphan files rather than with a unit that says it works offline
 * and does not.
 */
export async function forgetDownload(slug: string, lang: string): Promise<string[]> {
  const mine = await localFiles(slug, lang);
  const db = await openDb();
  if (db) {
    await db.execute("DELETE FROM unit_downloads WHERE slug = ? AND lang = ?", [slug, lang]);
    await db.execute("DELETE FROM unit_files WHERE slug = ? AND lang = ?", [slug, lang]);
  } else {
    await AsyncStorage.removeItem(unitKey(slug, lang));
    await AsyncStorage.removeItem(filesKey(slug, lang));
  }
  const stillNeeded = await referencedPaths();
  const orphans: string[] = [];
  for (const entry of mine) if (!stillNeeded.has(entry[1])) orphans.push(entry[1]);
  return orphans;
}

/** Every local path any remaining download still needs. */
export async function referencedPaths(): Promise<Set<string>> {
  const db = await openDb();
  const paths = new Set<string>();
  try {
    if (db) {
      const r = await db.execute("SELECT path FROM unit_files");
      for (const row of r.rows) paths.add(String(row["path"]));
      return paths;
    }
    for (const d of await listDownloads()) {
      for (const entry of await localFiles(d.slug, d.lang)) paths.add(entry[1]);
    }
  } catch {
    /* an unreadable index means we delete nothing, which is the safe way round */
  }
  return paths;
}

export async function downloadedBytes(): Promise<number> {
  let total = 0;
  for (const d of await listDownloads()) total += d.bytes;
  return total;
}
