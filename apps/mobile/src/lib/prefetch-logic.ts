import {
  nextLessonInPath,
  nextUnitForGuest,
  type PathResponse,
  type UnitSummary,
} from "@molo/core";
import type { QueryClient } from "@tanstack/react-query";

/**
 * What the home screen loads before the learner taps (docs/CACHING.md
 * section 2.0), as decisions over a QueryClient and injected sources so Jest
 * covers them without a network. `prefetch.ts` wires the real sources.
 *
 * Deliberately little: the unit that holds the next lesson, and — for a
 * signed-in learner — the review session. Never the whole course.
 */

/** A query as the prefetch needs it: its key and how to fetch it. */
export interface QuerySource<T> {
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<T>;
}

export interface NextUnitInput {
  readonly signedIn: boolean;
  /** `/path`, for a signed-in learner, whose crowns and locks live on the server. */
  readonly path: QuerySource<Pick<PathResponse, "units">>;
  /** The unit list and the lessons kept on the device, for a guest. */
  readonly units: readonly Pick<
    UnitSummary,
    "id" | "slug" | "lessonCount" | "prerequisiteUnitId"
  >[];
  readonly guestLessons: readonly { readonly unitSlug: string; readonly lessonId: string }[];
}

/**
 * The unit that holds the learner's next lesson. Signed in: the first
 * unfinished lesson of an open unit on `/path` (read from memory when it is
 * fresh, which the unit screen then reuses). A guest: the first unit they
 * may open and have not finished. Null when there is nothing left, or the
 * path cannot be read.
 */
export function nextUnitToPrefetch(qc: QueryClient, input: NextUnitInput): Promise<string | null> {
  if (!input.signedIn) return Promise.resolve(nextUnitForGuest(input.units, input.guestLessons));
  return qc.fetchQuery(input.path).then(
    (path) => nextLessonInPath(path)?.unitSlug ?? null,
    () => null,
  );
}

/** Fetch that unit into the entry the unit and lesson screens read. Answers its slug. */
export function prefetchNextUnit(
  qc: QueryClient,
  input: NextUnitInput,
  unit: (slug: string) => QuerySource<unknown>,
): Promise<string | null> {
  return nextUnitToPrefetch(qc, input).then((slug) =>
    slug ? qc.prefetchQuery(unit(slug)).then(() => slug) : null,
  );
}

/**
 * How old a prefetched review session may be before the home screen asks
 * again. A lesson in between introduces new words, so a session from before
 * it would miss them; a minute keeps that honest without a request on every
 * visit to the home screen.
 */
export const REVIEW_PREFETCH_STALE_MS = 60_000;

export interface ReviewPrefetchPorts {
  readonly session: QuerySource<unknown>;
  /** Replays ratings made offline; the server's session must come after them. */
  readonly flush: () => Promise<unknown>;
  /** True when the offline queue is known to be empty after the flush. */
  readonly queueEmpty: () => boolean;
}

/**
 * Prefetch the review session, unless a review screen is holding one: its
 * queue is being worked through, and replacing it under the learner would
 * move the card they are looking at. Ratings made offline are replayed
 * first, and if any are still waiting the prefetch is skipped, so the
 * session never offers a card whose rating is only queued.
 */
export function prefetchReviewSession(
  qc: QueryClient,
  ports: ReviewPrefetchPorts,
): Promise<boolean> {
  const held = qc.getQueryCache().find({ queryKey: ports.session.queryKey, exact: true });
  if (held && held.getObserversCount() > 0) return Promise.resolve(false);
  return ports
    .flush()
    .catch(() => undefined)
    .then(() => {
      if (!ports.queueEmpty()) return false;
      return qc
        .prefetchQuery({ ...ports.session, staleTime: REVIEW_PREFETCH_STALE_MS })
        .then(() => true);
    });
}
