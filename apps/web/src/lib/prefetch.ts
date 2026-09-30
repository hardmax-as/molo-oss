import { lessonAudioUrls, nextLessonOf, type PathRow, type UnitResponse } from "@molo/core";
import { queryOptions, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  getCrown,
  getLeague,
  getLeagueHistory,
  getMistakes,
  getPath,
  getReviewSession,
  getUnit,
  type Me,
} from "./api.ts";
import { detectLanguage, useLang } from "./i18n.tsx";

/**
 * What the web app loads before the learner asks for it (docs/CACHING.md
 * section 2.0). Every learner read goes from the browser to the API with the
 * session cookie; the server renders no learner data, so nothing here runs
 * during server rendering: a route loader that prefetched there would ask
 * without the cookie and answer for a guest. Loaders call these through
 * `inBrowser()` and never await them, so a navigation never waits on a
 * prefetch.
 *
 * The query definitions are the ones the pages use — same key, same fetch —
 * so a prefetch fills exactly the entry the page reads. `prefetchQuery`
 * never rejects: a prefetch that fails is a page that fetches for itself, as
 * it did before.
 */

/**
 * The key `useLearningPath` reads (`PATH_KEY` in path.ts), spelled out so
 * this module loads without the app's `~` alias, which the unit tests do not
 * resolve. prefetch.test.ts checks the two still agree.
 */
const PATH_KEY = ["path"] as const;

export function inBrowser(): boolean {
  return typeof window !== "undefined";
}

function signedIn(qc: QueryClient): boolean {
  return !!qc.getQueryData<Me | null>(["me"]);
}

/**
 * Whether this browser finished the welcome flow, read the way
 * `lib/onboarding.tsx` reads it. Used only to start fetching the path before
 * `/me` has answered: if the key ever moves, the home page loses that head
 * start, never correctness.
 */
export function onboardedHere(): boolean {
  if (!inBrowser()) return false;
  try {
    return window.localStorage.getItem("molo.onboarded") === "1";
  } catch {
    return false;
  }
}

/** A unit as the lesson page reads it (`learn.$slug.$lessonId.tsx`). */
export function unitQueryOptions(slug: string, lang: string) {
  return queryOptions({
    queryKey: ["unit", slug, lang] as const,
    queryFn: () => getUnit(slug, lang),
  });
}

/** How old a prefetched review session may be: see apps/mobile/src/lib/prefetch-logic.ts. */
export const REVIEW_PREFETCH_STALE_MS = 60_000;

/**
 * The review session, unless a review page is holding one: its queue is
 * being worked through and must not move under the learner.
 */
export function prefetchReviewSession(qc: QueryClient, lang: string): Promise<void> {
  const key = ["review-session", lang];
  if ((qc.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount() ?? 0) > 0) {
    return Promise.resolve();
  }
  return qc.prefetchQuery({
    queryKey: key,
    queryFn: () => getReviewSession(lang),
    staleTime: REVIEW_PREFETCH_STALE_MS,
  });
}

const warmed = new Set<string>();

/**
 * Fetch recordings ahead so the lesson's `<audio>` finds them in the
 * browser's cache (and, in production, the service worker's, which keeps
 * audio cache-first). The request is the one an `<audio>` element makes — no
 * CORS, cookies attached — so it lands under the entry the element will ask
 * for. Low priority, each URL once per page load, never editor audio.
 */
export function warmAudio(urls: readonly string[]): void {
  if (!inBrowser() || typeof fetch !== "function") return;
  for (const url of urls) {
    if (!/^https?:\/\//i.test(url) || url.includes("b=private") || warmed.has(url)) continue;
    warmed.add(url);
    const init: RequestInit & { priority?: "low" } = {
      mode: "no-cors",
      credentials: "include",
      priority: "low",
    };
    fetch(url, init).catch(() => warmed.delete(url));
  }
}

/**
 * The unit a lesson opens from, and the clips of that lesson's first
 * `count` exercises.
 */
export function prefetchLesson(
  qc: QueryClient,
  slug: string,
  lessonId: string | null,
  lang: string,
  count = 3,
): Promise<void> {
  return qc.prefetchQuery(unitQueryOptions(slug, lang)).then(() => {
    const unit = qc.getQueryData<UnitResponse>(["unit", slug, lang]);
    if (unit && lessonId) warmAudio(lessonAudioUrls(unit, lessonId, 0, count));
    return undefined;
  });
}

/**
 * Run `task` once the browser is idle, and answer a cancel. An effect that
 * schedules through this is cancelled if the page re-renders into another
 * language first (the root switches from the server's English to the
 * browser's language right after hydration), so a prefetch is made once, in
 * the language the page will read.
 */
export function whenIdle(task: () => void): () => void {
  if (!inBrowser()) return () => undefined;
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 200);
  return () => window.clearTimeout(id);
}

// ---- route loaders -----------------------------------------------------------
// Hover and touch run these through `defaultPreload: "intent"` (router.tsx),
// and so does the navigation itself. Browser only, signed-in only where the
// read is the learner's own, and never awaited.

/**
 * The path, which the home and unit pages draw. Only for a browser that will
 * show it: a first-time visitor gets the landing page, which never asks for
 * the path (index.tsx).
 */
export function preloadPath(qc: QueryClient): void {
  if (!inBrowser() || !(signedIn(qc) || onboardedHere())) return;
  void qc.prefetchQuery({ queryKey: PATH_KEY, queryFn: getPath });
}

export function preloadUnitPage(qc: QueryClient, slug: string): void {
  if (!inBrowser()) return;
  void qc.prefetchQuery({ queryKey: PATH_KEY, queryFn: getPath });
  if (signedIn(qc)) {
    void qc.prefetchQuery({ queryKey: ["crown", slug], queryFn: () => getCrown(slug) });
  }
}

export function preloadReview(qc: QueryClient): void {
  if (!inBrowser() || !signedIn(qc)) return;
  void prefetchReviewSession(qc, detectLanguage());
}

export function preloadMistakes(qc: QueryClient): void {
  if (!inBrowser() || !signedIn(qc)) return;
  const lang = detectLanguage();
  void qc.prefetchQuery({
    queryKey: ["mistakes", lang],
    queryFn: () => getMistakes(lang),
    // The mistakes link's own freshness (MistakesLink.tsx).
    staleTime: 30_000,
  });
}

export function preloadLeagues(qc: QueryClient): void {
  if (!inBrowser() || !signedIn(qc)) return;
  // The leagues page's own freshness (leagues.tsx).
  void qc.prefetchQuery({ queryKey: ["league"], queryFn: getLeague, staleTime: 60_000 });
  void qc.prefetchQuery({
    queryKey: ["league-history"],
    queryFn: getLeagueHistory,
    staleTime: 60_000,
  });
}

// ---- page hooks --------------------------------------------------------------

/**
 * The home page, once its path is drawn: the unit that holds the next lesson
 * and the first clips of that lesson, so tapping the node the guide points at
 * opens a lesson with nothing to wait for; and, signed in, the review
 * session. `rows` is null while the path is loading.
 */
export function usePrefetchNext(rows: readonly PathRow[] | null, isSignedIn: boolean): void {
  const qc = useQueryClient();
  const { lang } = useLang();
  const next = rows ? nextLessonOf(rows) : null;
  const slug = next?.unitSlug ?? null;
  const lessonId = next?.lessonId ?? null;
  useEffect(
    () =>
      whenIdle(() => {
        if (slug) void prefetchLesson(qc, slug, lessonId, lang);
        if (isSignedIn) void prefetchReviewSession(qc, lang);
      }),
    [qc, slug, lessonId, isSignedIn, lang],
  );
}

/**
 * A unit page: the unit payload every lesson on it opens from, and the first
 * clips of the lesson its guide points at. Nothing for a locked unit, whose
 * lessons do not open. `rows` is null while the path is loading.
 */
export function usePrefetchUnit(slug: string, rows: readonly PathRow[] | null): void {
  const qc = useQueryClient();
  const { lang } = useLang();
  const header = rows?.find((r) => r.type === "unit");
  const ready = rows !== null && !(header?.type === "unit" && header.locked);
  const lessonId = rows ? (nextLessonOf(rows)?.lessonId ?? null) : null;
  useEffect(() => {
    if (!ready) return undefined;
    return whenIdle(() => void prefetchLesson(qc, slug, lessonId, lang));
  }, [qc, slug, lessonId, ready, lang]);
}
