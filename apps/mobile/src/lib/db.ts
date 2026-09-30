import * as SecureStore from "expo-secure-store";

/**
 * On-device store: op-sqlite with SQLCipher (docs/STACK.md), the key kept
 * in the keychain. Two tables: opened units for airplane-mode replay and
 * the queue of review ratings made offline, replayed when online.
 *
 * The native module is loaded lazily and guarded: a dev client built
 * before op-sqlite was added still runs (the store just reports
 * `available: false` and callers fall back to AsyncStorage).
 */
const KEY_NAME = "molo.db.key";

type Scalar = string | number | boolean | null;
interface Db {
  execute: (sql: string, params?: Scalar[]) => Promise<{ rows: Array<Record<string, Scalar>> }>;
}

let db: Db | null | undefined;

function randomKey(): string {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;
  const key = randomKey();
  await SecureStore.setItemAsync(KEY_NAME, key);
  return key;
}

/** Opens (once) and migrates. Null when the native module is not in this build. */
export async function openDb(): Promise<Db | null> {
  if (db !== undefined) return db;
  try {
    // Deferred so a bundle without the native module does not crash at import time.
    const mod = (await import("@op-engineering/op-sqlite")) as {
      open: (o: { name: string; encryptionKey?: string }) => Db;
    };
    const handle = mod.open({ name: "molo.sqlite", encryptionKey: await encryptionKey() });
    await handle.execute(
      "CREATE TABLE IF NOT EXISTS units (slug TEXT NOT NULL, lang TEXT NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (slug, lang))",
    );
    await handle.execute(
      "CREATE TABLE IF NOT EXISTS pending_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL, rating INTEGER NOT NULL, today TEXT NOT NULL, created_at INTEGER NOT NULL)",
    );
    // A downloaded unit: written only when every recording arrived, so a row
    // here is a promise that the unit works with no signal (src/lib/downloads.ts).
    await handle.execute(
      "CREATE TABLE IF NOT EXISTS unit_downloads (slug TEXT NOT NULL, lang TEXT NOT NULL, bytes INTEGER NOT NULL, files INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (slug, lang))",
    );
    // Which recordings that unit needs, and where they landed. Files are
    // shared between units, so removing one unit deletes only what no other
    // one still references.
    await handle.execute(
      "CREATE TABLE IF NOT EXISTS unit_files (slug TEXT NOT NULL, lang TEXT NOT NULL, url TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY (slug, lang, url))",
    );
    db = handle;
  } catch {
    db = null;
  }
  return db;
}

export async function dbAvailable(): Promise<boolean> {
  return (await openDb()) !== null;
}
