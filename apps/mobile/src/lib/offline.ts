import type { ReviewRequest, UnitResponse, UnitSummary } from "@molo/core";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { rateCard } from "./api.ts";
import { openDb } from "./db.ts";

/**
 * Offline data (ARCHITECTURE section 10): opened units replay in airplane
 * mode, and review ratings made offline queue up and replay when a session
 * next loads. Backed by the encrypted op-sqlite store; AsyncStorage is the
 * fallback for a build without the native module. Only published content
 * ever lands here because the API only serves published content.
 *
 * The same copies are what a screen shows while the network answers
 * (docs/CACHING.md section 2.0): a unit opened before, and the unit list, are
 * drawn from here at once and replaced when the fresh copy lands.
 */
const PREFIX = "molo.unit.";
const QUEUE_KEY = "molo.pending_reviews";
/**
 * The unit list: small, and the same shape the API sent, so it lives in
 * AsyncStorage rather than in a table of its own.
 */
const UNIT_LIST_KEY = "molo.unit-list";

export async function cacheUnit(slug: string, lang: string, unit: UnitResponse): Promise<void> {
  const json = JSON.stringify(unit);
  const db = await openDb();
  try {
    if (db) {
      await db.execute(
        "INSERT OR REPLACE INTO units (slug, lang, json, updated_at) VALUES (?, ?, ?, ?)",
        [slug, lang, json, Date.now()],
      );
    } else {
      await AsyncStorage.setItem(`${PREFIX}${lang}.${slug}`, json);
    }
  } catch {
    /* cache is best effort */
  }
}

export async function cachedUnit(slug: string, lang: string): Promise<UnitResponse | null> {
  const db = await openDb();
  try {
    if (db) {
      const r = await db.execute("SELECT json FROM units WHERE slug = ? AND lang = ?", [
        slug,
        lang,
      ]);
      const json = r.rows[0]?.["json"];
      return typeof json === "string" ? (JSON.parse(json) as UnitResponse) : null;
    }
    const raw = await AsyncStorage.getItem(`${PREFIX}${lang}.${slug}`);
    return raw ? (JSON.parse(raw) as UnitResponse) : null;
  } catch {
    return null;
  }
}

export interface UnitList {
  readonly units: readonly UnitSummary[];
}

/** Remembers the last unit list the API sent, so the home screen can draw it before asking again. */
export async function cacheUnitList(list: UnitList): Promise<void> {
  try {
    await AsyncStorage.setItem(UNIT_LIST_KEY, JSON.stringify(list));
  } catch {
    /* cache is best effort */
  }
}

export async function cachedUnitList(): Promise<UnitList | null> {
  try {
    const raw = await AsyncStorage.getItem(UNIT_LIST_KEY);
    const parsed = raw ? (JSON.parse(raw) as UnitList) : null;
    return parsed && Array.isArray(parsed.units) ? parsed : null;
  } catch {
    return null;
  }
}

let flushing: Promise<number> | null = null;
/** True once a flush has emptied the queue and nothing has been queued since. */
let settled = false;

export interface PendingReview {
  readonly cardId: string;
  readonly rating: ReviewRequest["rating"];
  readonly today: string;
}

async function readQueue(): Promise<PendingReview[]> {
  const db = await openDb();
  if (db) {
    const r = await db.execute("SELECT card_id, rating, today FROM pending_reviews ORDER BY id");
    return r.rows.map((row) => ({
      cardId: String(row["card_id"]),
      rating: Number(row["rating"]) as ReviewRequest["rating"],
      today: String(row["today"]),
    }));
  }
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as PendingReview[]) : [];
}

async function writeQueue(items: PendingReview[]): Promise<void> {
  const db = await openDb();
  if (db) {
    await db.execute("DELETE FROM pending_reviews");
    for (const it of items) {
      await db.execute(
        "INSERT INTO pending_reviews (card_id, rating, today, created_at) VALUES (?, ?, ?, ?)",
        [it.cardId, it.rating, it.today, Date.now()],
      );
    }
    return;
  }
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

/** Remembers a rating the network refused; replayed by `flushPendingReviews`. */
export async function queueReview(item: PendingReview): Promise<void> {
  settled = false;
  try {
    await writeQueue([...(await readQueue()), item]);
  } catch {
    /* best effort */
  }
}

export async function pendingReviewCount(): Promise<number> {
  try {
    return (await readQueue()).length;
  } catch {
    return 0;
  }
}

/**
 * Whether the queue is known to be empty right now, without reading it: the
 * review screen can then show a prefetched session at once instead of
 * waiting a frame for a flush that has nothing to send.
 */
export function pendingReviewsSettled(): boolean {
  return settled && flushing === null;
}

/**
 * Replays queued ratings in order; stops at the first network failure and
 * keeps the rest. One flush at a time: the home screen flushes before it
 * prefetches the review session and the review screen flushes when it opens,
 * and two flushes reading the same queue would send each rating twice.
 */
export function flushPendingReviews(): Promise<number> {
  if (!flushing) {
    flushing = replayPendingReviews().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function replayPendingReviews(): Promise<number> {
  let sent = 0;
  try {
    const queue = await readQueue();
    for (const it of queue) {
      try {
        await rateCard(it.cardId, { rating: it.rating, today: it.today });
        sent++;
      } catch (e) {
        // A 4xx means the card is gone or already rated: drop it. Anything else: keep and stop.
        const status = (e as { status?: number }).status;
        if (status && status >= 400 && status < 500) {
          sent++;
          continue;
        }
        break;
      }
    }
    await writeQueue(queue.slice(sent));
    settled = sent === queue.length;
  } catch {
    /* best effort */
  }
  return sent;
}
