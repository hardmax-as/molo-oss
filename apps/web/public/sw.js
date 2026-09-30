/**
 * Molo's service worker (docs/CACHING.md section 2.2).
 *
 * A browser learner in the Karoo should get what the mobile learner gets: the
 * app opens, the unit they were on opens, and the recordings play. That is
 * all this is for, and it is deliberately the smallest thing that does it.
 *
 * Plain JavaScript because `public/` is copied byte for byte by Vite — no
 * TypeScript, no bundling, no imports. Registered from `src/lib/sw.ts`, and
 * only in a production build: a worker caching `vite dev`'s HTML and modules
 * would fight the dev server for no benefit.
 *
 * ---------------------------------------------------------------------------
 * The rules, in the order they are applied
 * ---------------------------------------------------------------------------
 *
 * 1. **Anything but GET is passed straight through.** Sign-in, answers,
 *    reviews, reports — none of it is this worker's business.
 * 2. **Learner state is never cached, online or off.** `/me`, `/me/progress`,
 *    hearts, reviews, mistakes, leagues: a stale streak or a stale XP total is
 *    worse than a spinner, because the learner believes it. The list of API
 *    paths that may be cached is closed and short, and everything not on it
 *    falls through.
 * 3. **No editor route is ever cached**, on either origin. The publish gate is
 *    the mechanism the whole content model rests on, and an editor looking at
 *    yesterday's draft is a way to break it.
 * 4. **Recordings are cache-first.** `GET /audio/<sha256>` is immutable by
 *    construction — the key is the file's own hash — so a recording fetched
 *    once never needs fetching again. This is the biggest single saving for a
 *    learner on South African mobile data. Signed private audio (`?b=private`,
 *    editorial) is never cached.
 * 5. **Published content and the shell are network-first**, falling back to
 *    the last copy only when the network actually fails. So a learner online
 *    always sees the truth, including their own unlocks and badges, and a
 *    learner with no signal gets what they last saw rather than nothing.
 * 6. **A deploy must not strand anyone.** The worker takes over as soon as it
 *    installs, sweeps every cache that is not this version's, and — because
 *    navigations are network-first — never pins an old HTML document while
 *    the network is up. Hashed asset URLs change per deploy, so a cached one
 *    can only be right.
 */

const VERSION = "v1";
const SHELL = `molo-shell-${VERSION}`;
const STATIC = `molo-static-${VERSION}`;
const AUDIO = `molo-audio-${VERSION}`;
const DATA = `molo-data-${VERSION}`;
const OURS = [SHELL, STATIC, AUDIO, DATA];

/** Roughly a long unit's worth of recordings before the oldest are dropped. */
const AUDIO_LIMIT = 400;

/**
 * The API origin, handed in on the registration URL (`/sw.js?api=…`). A
 * worker is restarted freely and keeps no memory between events, so it has to
 * be something readable from `self.location` rather than something posted in.
 * Changing the API origin changes the worker's URL, which is itself an update.
 */
function apiOrigin() {
  try {
    return new URL(self.location.href).searchParams.get("api") || null;
  } catch {
    return null;
  }
}

/** Published API paths that may be cached. Closed, deliberately (rule 2). */
function isPublishedContentPath(pathname) {
  return pathname === "/units" || pathname === "/path" || /^\/units\/[^/]+$/.test(pathname);
}

function isEditorPath(pathname) {
  return pathname === "/edit" || pathname.startsWith("/edit/");
}

/** Files Vite emits with a content hash in the name, plus the static art. */
function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    /\.(?:css|js|mjs|woff2?|png|jpg|jpeg|svg|webp|ico|webmanifest)$/.test(pathname)
  );
}

/**
 * What to do with one request. Pure, and exported on `self` so a unit test can
 * hold it to the rules above without a browser (`src/lib/sw-policy.test.ts`).
 */
function policyFor(request, url, api, origin) {
  if (request.method !== "GET") return "pass";
  if (isEditorPath(url.pathname)) return "pass";

  if (api && url.origin === api) {
    // Signed, expiring, editorial. Never ours to keep.
    if (url.searchParams.get("b") === "private") return "pass";
    if (url.pathname.startsWith("/audio/")) return "audio";
    if (isPublishedContentPath(url.pathname)) return "data";
    return "pass";
  }

  if (url.origin === origin) {
    if (request.mode === "navigate") return "shell";
    if (isStaticAsset(url.pathname)) return "static";
    return "pass";
  }

  return "pass";
}

self.__molo = { policyFor, isPublishedContentPath, isEditorPath, isStaticAsset, VERSION, OURS };

self.addEventListener("install", (event) => {
  // Straight to waiting-is-over: the alternative is a learner running last
  // week's bundle until every tab is closed, which on a phone is never.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n.startsWith("molo-") && !OURS.includes(n))
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Sign-out: forget everything that was answered for a particular person. */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "molo:forget") {
    event.waitUntil(Promise.all([caches.delete(DATA), caches.delete(SHELL)]));
  }
});

function trim(cacheName, limit) {
  return caches.open(cacheName).then((cache) =>
    cache.keys().then((keys) => {
      if (keys.length <= limit) return undefined;
      return Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k))).then(
        () => undefined,
      );
    }),
  );
}

/**
 * Cache-first, for things whose URL names their content. An opaque response
 * (an `<audio>` element fetches without CORS) cannot be inspected, so its
 * status is unknowable; it is kept anyway, because the alternative is never
 * caching audio at all, and a bad one is corrected by the next deploy's
 * version sweep.
 */
function cacheFirst(request, cacheName, limit) {
  return caches.match(request).then((hit) => {
    if (hit) return hit;
    return fetch(request).then((response) => {
      if (response && (response.status === 200 || response.type === "opaque")) {
        const copy = response.clone();
        void caches
          .open(cacheName)
          .then((cache) => cache.put(request, copy))
          .then(() => (limit ? trim(cacheName, limit) : undefined))
          .catch(() => undefined);
      }
      return response;
    });
  });
}

/**
 * Network-first. The cached copy is only ever reached when the network fails,
 * which is the one moment a learner prefers yesterday's lesson to an error.
 */
function networkFirst(request, cacheName) {
  return fetch(request).then(
    (response) => {
      if (response && response.status === 200 && response.type !== "opaque") {
        const copy = response.clone();
        void caches
          .open(cacheName)
          .then((cache) => cache.put(request, copy))
          .catch(() => undefined);
      }
      return response;
    },
    (error) =>
      caches.match(request).then((hit) => {
        if (hit) return hit;
        throw error;
      }),
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  const decision = policyFor(request, url, apiOrigin(), self.location.origin);
  if (decision === "pass") return;
  if (decision === "audio") event.respondWith(cacheFirst(request, AUDIO, AUDIO_LIMIT));
  else if (decision === "static") event.respondWith(cacheFirst(request, STATIC, 0));
  else if (decision === "data") event.respondWith(networkFirst(request, DATA));
  else if (decision === "shell") event.respondWith(networkFirst(request, SHELL));
});
