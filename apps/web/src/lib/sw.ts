import { apiUrl } from "./api.ts";

/**
 * Registers `public/sw.js` (docs/CACHING.md section 2.2), so a browser learner
 * with no signal gets what the mobile learner gets: the app opens, the unit
 * they were on opens, and the recordings play.
 *
 * **Production builds only.** A worker caching `vite dev`'s HTML and modules
 * would fight the dev server and hide changes for no benefit, and the Playwright
 * suite runs against the dev server.
 *
 * The API origin is handed over in the registration URL rather than posted in a
 * message: a service worker is stopped and restarted freely and keeps nothing
 * between events, so anything it needs on every request has to be readable from
 * its own location. It also means that pointing the app at a different API is
 * itself a worker update.
 *
 * `updateViaCache: "none"` says out loud what browsers now do by default —
 * fetch `sw.js` past the HTTP cache — so a deploy is picked up rather than
 * waiting on a stale copy.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const url = `/sw.js?api=${encodeURIComponent(new URL(apiUrl()).origin)}`;
  void navigator.serviceWorker
    .register(url, { scope: "/", updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch(() => undefined);
}

/**
 * Sign-out: drop the copies that were answered for a particular person. The
 * worker keeps no learner state of its own, but the last unit and the last
 * rendered page were fetched with that person's session, and the next person
 * on this browser should not meet them.
 */
export function forgetCachedPages(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ type: "molo:forget" });
}
