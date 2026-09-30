import { QueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * The web app's QueryClient, one per router (docs/CACHING.md section 2.0),
 * the same rules as apps/mobile/src/lib/query-client.ts. Two things live
 * here rather than at each call site.
 *
 * **Content stays in memory long enough to make going back instant.** A unit,
 * the unit list and the path are shown straight from memory on the way back
 * to a screen, and only fetched again once they are older than
 * `CONTENT_STALE_MS`. Each of them also carries this learner's state (locks,
 * crowns, the "new word" and "tricky" badges), which is why the second rule
 * exists.
 *
 * **Learning moves them on.** When the learner's experience points change —
 * a lesson, a review rating, a mistake practised, a chest — every piece of
 * content that carries their state is marked stale, so the next screen to
 * show it fetches it again behind the copy it already has. Marked, not
 * refetched on the spot: the lesson screen is still showing the unit while
 * its celebration runs. And when the signed-in account changes, the same
 * content is fetched again at once, because it was answered for someone else.
 * Hearts do not count as learning: losing one changes no lock and no badge.
 */

/** How long a unit, the unit list or the path is served from memory without asking again. */
export const CONTENT_STALE_MS = 5 * 60_000;
/** How long they stay in memory once no screen shows them. */
export const CONTENT_GC_MS = 30 * 60_000;

/** The content queries that carry the learner's own state on top of published rows. */
export const LEARNER_CONTENT_KEYS: readonly QueryKey[] = [["unit"], ["units"], ["path"]];

function xpOf(data: unknown): number | undefined {
  const xp = (data as { xpTotal?: unknown } | null | undefined)?.xpTotal;
  return typeof xp === "number" ? xp : undefined;
}

function userIdOf(data: unknown): string | null {
  const id = (data as { user?: { id?: unknown } } | null | undefined)?.user?.id;
  return typeof id === "string" ? id : null;
}

/**
 * Subscribes the two rules above to a client's cache and answers the
 * unsubscribe. Separate from `createQueryClient` so a test can hold a bare
 * client to it.
 */
export function watchLearnerState(qc: QueryClient): () => void {
  let xp: number | undefined;
  let userId: string | null | undefined;
  return qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const key = event.query.queryKey;
    if (key.length !== 1) return;
    if (key[0] === "progress") {
      const next = xpOf(event.query.state.data);
      if (next === undefined) return;
      const before = xp;
      xp = next;
      if (before === undefined || before === next) return;
      // Deferred: the cache is mid-notification, and a nested invalidation
      // would re-enter it.
      queueMicrotask(() => {
        for (const queryKey of LEARNER_CONTENT_KEYS) {
          void qc.invalidateQueries({ queryKey, refetchType: "none" });
        }
      });
      return;
    }
    if (key[0] === "me") {
      const next = userIdOf(event.query.state.data);
      const before = userId;
      userId = next;
      if (before === undefined || before === next) return;
      xp = undefined;
      queueMicrotask(() => {
        for (const queryKey of LEARNER_CONTENT_KEYS) void qc.invalidateQueries({ queryKey });
      });
    }
  });
}

export function createQueryClient(): QueryClient {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  });
  for (const queryKey of LEARNER_CONTENT_KEYS) {
    qc.setQueryDefaults(queryKey, { staleTime: CONTENT_STALE_MS, gcTime: CONTENT_GC_MS });
  }
  watchLearnerState(qc);
  return qc;
}
