/**
 * Published content in the Worker's own cache, keyed by a content version
 * (docs/CACHING.md section 3).
 *
 * The shape of the argument: a unit, a lesson's exercises, a word and its
 * recording are the same bytes for every learner and change only when an
 * editor publishes. A learner's XP, streak, hearts and review cards change
 * on every answer and belong to one person. The first kind belongs in a
 * cache near the learner — Cloudflare has data centres in Johannesburg,
 * Cape Town and Durban, and the database is in Europe. The second kind must
 * never be in one.
 *
 * **Invalidation.** We do not purge. A purge is a distributed system
 * pretending to be a variable, and it fails quietly. Instead the key carries
 * a version that moves when published content moves, so publishing makes the
 * old keys unreachable rather than wrong; the orphans expire on their own.
 * The Worker reads that version at most once a minute per isolate.
 *
 * **The trade, stated out loud: an editor's publish reaches learners within
 * a minute, not instantly.** That is the right way round. An editor accepts
 * a minute; a learner in Cape Town should not pay a European round trip for
 * a word list that has not changed since March.
 *
 * **What this file corrects in CACHING.md.** The page assumed a published
 * response is identical for every learner given a course and a language. In
 * this codebase it is not: `/units`, `/path` and `/units/:slug` each carry
 * the caller's own state — which units their progress has unlocked, and the
 * "new word" and "tricky" badges computed from what they have seen and got
 * wrong. Those responses are therefore cached **only for a request with no
 * session**, where they are pure content by construction. A signed-in
 * learner gets `private, no-store` and is served from the database, with
 * Hyperdrive's cached read path (infra/alchemy.run.ts) shortening the query
 * half. Sharing an assembled response between two learners to save a query
 * would be a privacy bug, and no amount of latency is worth one.
 */

import { readContentVersion, type ContentVersion, type Db } from "@molo/db";
import type { Context } from "hono";

import type { AppEnv } from "./env.ts";

/** How long the Worker holds a content version before re-reading it. */
export const CONTENT_VERSION_TTL_MS = 60_000;

/** What a cacheable published response tells the browser. Matches the TTL above. */
export const PUBLIC_CACHE_CONTROL = "public, max-age=60";

/**
 * What the Worker's own copy is stored under. Long, deliberately: the key
 * already names the version, so an entry can never be stale — only orphaned.
 * Storing at 60 seconds would throw the entry away every minute and put the
 * database back on the path, which is the thing this exists to avoid.
 */
export const STORED_CACHE_CONTROL = "public, max-age=86400";

/** Everything else. Learner state and editor screens, without exception. */
export const PRIVATE_CACHE_CONTROL = "private, no-store";

/**
 * The published-content routes, and the whole list. Anything not named here
 * is not cached, which is why this is a closed set rather than a flag on a
 * handler: adding a route to the cache has to be a deliberate edit to this
 * line, reviewed next to the reasons above.
 */
export const PUBLISHED_ROUTES = ["units", "unit", "path"] as const;
export type PublishedRoute = (typeof PUBLISHED_ROUTES)[number];

/** The path each published route answers on, as it arrives at the Worker. */
const ROUTE_PATHS: Record<PublishedRoute, RegExp> = {
  units: /^\/units$/,
  // A unit by slug, and nothing under it: `/units/:slug/crown` is the
  // learner's own progress and must fall through to `private, no-store`.
  unit: /^\/units\/[^/]+$/,
  path: /^\/path$/,
};

export type CacheRefusal = "not_a_get" | "editor_route" | "not_published_content" | "has_a_session";

export type CacheDecision =
  | { readonly cache: true; readonly route: PublishedRoute; readonly cacheControl: string }
  | { readonly cache: false; readonly why: CacheRefusal; readonly cacheControl: string };

export interface RequestFacts {
  readonly method: string;
  readonly path: string;
  /** True when the request resolved to an actor — a learner, editor or admin. */
  readonly signedIn: boolean;
}

/**
 * Whether a response may be shared, and what its `cache-control` says. The
 * default is no: a route reaches the cache only by being in
 * `PUBLISHED_ROUTES`, only for a `GET`, and only with no session attached.
 */
export function decideCache(req: RequestFacts): CacheDecision {
  const refuse = (why: CacheRefusal): CacheDecision => ({
    cache: false,
    why,
    cacheControl: PRIVATE_CACHE_CONTROL,
  });
  if (req.method !== "GET") return refuse("not_a_get");
  // Belt and braces. No editor path is in the table below; this says so
  // anyway, because the cost of the sentence is nothing and the cost of an
  // editor's draft reaching a learner is the whole product.
  if (req.path === "/edit" || req.path.startsWith("/edit/")) return refuse("editor_route");
  const route = PUBLISHED_ROUTES.find((r) => ROUTE_PATHS[r].test(req.path));
  if (!route) return refuse("not_published_content");
  if (req.signedIn) return refuse("has_a_session");
  return { cache: true, route, cacheControl: PUBLIC_CACHE_CONTROL };
}

/**
 * The version token. Two numbers rather than one because neither is
 * sufficient alone: the row count cannot go backwards but two edits in the
 * same restore could land at one count, and the timestamp moves on every
 * write but a clock can. Together they change whenever `content_revisions`
 * gains a row, which is whenever a status changes.
 */
export function versionTokenOf(v: ContentVersion): string {
  const at = v.latestAt ? Date.parse(v.latestAt) : Number.NaN;
  return `${v.revisions}-${Number.isNaN(at) ? 0 : at}`;
}

export interface CacheKeyParts {
  readonly version: string;
  readonly route: PublishedRoute;
  /** The course the response is about; `null` only before any course exists. */
  readonly courseId: string | null;
  /** The interface language the glosses are in. */
  readonly lang: string;
  /** Anything else that changes the body — the unit slug, and nothing personal. */
  readonly params?: Readonly<Record<string, string>>;
}

/**
 * The cache key, on the Worker's own origin because Cloudflare's cache
 * refuses a key from a hostname the zone does not own. `/__content/` is not
 * a route: nothing is ever served from it, it only names entries.
 */
export function contentCacheKey(origin: string, parts: CacheKeyParts): string {
  const url = new URL(`/__content/${parts.route}`, origin);
  url.searchParams.set("v", parts.version);
  url.searchParams.set("course", parts.courseId ?? "none");
  url.searchParams.set("lang", parts.lang);
  for (const [k, value] of Object.entries(parts.params ?? {}))
    url.searchParams.set(`p.${k}`, value);
  // Sorted, so two callers that pass the same facts in a different order
  // land on the same entry rather than on two.
  url.searchParams.sort();
  return url.toString();
}

interface VersionMemo {
  readonly token: string;
  readonly courseId: string | null;
  readonly at: number;
}

/**
 * Per-isolate, which is the whole point: a warm isolate answers from this
 * and touches nothing. A cold one pays one query. Sixty seconds is the
 * promise in CACHING.md section 3 and the number Hyperdrive's read-path
 * cache uses, so the two layers go stale together.
 */
let memo: VersionMemo | null = null;

export async function contentVersion(
  db: Db,
  now: number = Date.now(),
): Promise<{ readonly token: string; readonly courseId: string | null }> {
  if (memo && now - memo.at < CONTENT_VERSION_TTL_MS) return memo;
  const read = await readContentVersion(db);
  memo = { token: versionTokenOf(read), courseId: read.defaultCourseId, at: now };
  return memo;
}

/** Tests only. The isolate is otherwise the lifetime. */
export function forgetContentVersion(): void {
  memo = null;
}

/** `caches.default` where there is one; `null` under Vitest and Bun. */
function edgeCache(): Cache | null {
  const g = globalThis as { caches?: { default?: Cache } };
  return g.caches?.default ?? null;
}

function outgoingHeaders(version: string, state: "hit" | "miss"): HeadersInit {
  return {
    "content-type": "application/json; charset=UTF-8",
    "cache-control": PUBLIC_CACHE_CONTROL,
    // A shared proxy must not hand this to a request that carries a session:
    // the body is the guest variant, and the two differ.
    vary: "cookie",
    "x-molo-content-version": version,
    "x-molo-cache": state,
  };
}

/**
 * Answer a published-content route, from the Worker's cache when the request
 * is eligible and from `build` when it is not. `build` is only ever called
 * on a miss, so it is where the database work belongs.
 */
export async function publishedJson(
  c: Context<AppEnv>,
  route: PublishedRoute,
  params: Readonly<Record<string, string>>,
  build: () => Promise<unknown>,
): Promise<Response> {
  const decision = decideCache({
    method: c.req.method,
    path: c.req.path,
    signedIn: c.get("actor") !== null,
  });
  if (!decision.cache || decision.route !== route) {
    return Response.json(await build(), {
      headers: { "cache-control": PRIVATE_CACHE_CONTROL },
    });
  }

  const { token, courseId } = await contentVersion(c.get("db"));
  const key = contentCacheKey(new URL(c.req.url).origin, {
    version: token,
    route,
    courseId,
    lang: c.get("sourceLang"),
    params,
  });

  const cache = edgeCache();
  const hit = await cache?.match(key);
  if (hit) return new Response(hit.body, { headers: outgoingHeaders(token, "hit") });

  // One string, two responses: the stored copy and the answer. Cloning a
  // response tees its stream, and there is no reason to make the runtime do
  // that for a body we have already serialised.
  const text = JSON.stringify(await build());
  if (cache) {
    const stored = new Response(text, {
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "cache-control": STORED_CACHE_CONTROL,
      },
    });
    c.executionCtx.waitUntil(cache.put(key, stored));
  }
  return new Response(text, { headers: outgoingHeaders(token, "miss") });
}

/**
 * Everything that did not opt in says so. Placed first in the chain, so a
 * new route is `private, no-store` by omission rather than by remembering:
 * the failure mode of forgetting is "not cached", never "cached wrongly".
 */
export async function noStoreByDefault(
  c: Context<AppEnv>,
  next: () => Promise<void>,
): Promise<void> {
  await next();
  if (!c.res.headers.has("cache-control")) c.header("cache-control", PRIVATE_CACHE_CONTROL);
}
