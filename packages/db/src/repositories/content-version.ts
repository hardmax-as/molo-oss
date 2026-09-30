/**
 * The published-content version (docs/CACHING.md section 3).
 *
 * Every cache key for published content carries a number that changes when
 * published content changes, so a publish makes the old keys unreachable
 * rather than wrong. No purge, no fan-out, no distributed system pretending
 * to be a variable.
 *
 * `content_revisions` is the source of that number: the editor repository
 * appends a row to it inside the same transaction as every status change
 * and every field edit, for the audit trail. Two corrections to what
 * CACHING.md said about it:
 *
 * 1. **`id` is a random UUID, not a sequence.** "The highest id" is not a
 *    number and does not increase. What does increase is the row count —
 *    the table is append-only, and the one update it ever takes (blanking
 *    `actor_id` when an account is deleted) touches neither the count nor
 *    `created_at`. The count paired with the newest `created_at` is the
 *    honest monotonic pair, and the pair rather than either alone because a
 *    restored backup could move one without the other.
 * 2. **It moves on any edit, not only on a publish.** A draft edit writes a
 *    revision too, so the version is an over-approximation: it can change
 *    when nothing a learner sees has changed. That direction is the safe
 *    one — a wasted cache fill, never a stale lesson — and it costs one
 *    round trip per edge per minute.
 *
 * The default course id rides along because a guest's cache key names the
 * course, and asking for it separately would put a query back on the hot
 * path that this whole mechanism exists to remove.
 */

import { sql } from "drizzle-orm";

import type { Db } from "../client.ts";

export interface ContentVersion {
  /** Rows in `content_revisions`. Append-only, so this never goes down. */
  readonly revisions: number;
  /** The newest revision's timestamp as ISO text, or null when there are none. */
  readonly latestAt: string | null;
  /** The course a request with no enrolment gets, so a key can name it. */
  readonly defaultCourseId: string | null;
}

/**
 * One round trip for the whole version. Deliberately mentions no `now()`,
 * `current_timestamp` or other STABLE function: Hyperdrive refuses to cache
 * a query whose text names one, and callers may route this through the
 * cached binding.
 */
export async function readContentVersion(db: Db): Promise<ContentVersion> {
  const rows = (await db.execute(sql`
    select
      (select count(*)::int from content_revisions) as revisions,
      (select max(created_at)::text from content_revisions) as latest_at,
      (select id::text from courses where is_default = true limit 1) as default_course_id
  `)) as unknown as Array<{
    revisions: number | string;
    latest_at: string | null;
    default_course_id: string | null;
  }>;
  const row = rows[0];
  return {
    revisions: Number(row?.revisions ?? 0),
    latestAt: row?.latest_at ?? null,
    defaultCourseId: row?.default_course_id ?? null,
  };
}
