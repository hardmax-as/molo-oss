import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../env.ts";
import { verifyAudioUrl } from "../signing.ts";

/**
 * Streams an audio object.
 *
 * A plain `/audio/<key>` is the published bucket: no signature, because there
 * is nothing to protect. Only a published asset is ever copied there, the key
 * is the file's own SHA-256, and the bytes at a key never change. That is what
 * lets the response be cached for a year at an edge near the learner instead of
 * re-fetched from Europe every hour (docs/CACHING.md).
 *
 * `?b=private` is the unpublished bucket, and it keeps everything it had: a
 * signature that expires, and an editorial session on top, so a leaked link is
 * useless to anyone else.
 */
export const audioRoutes = new Hono<AppEnv>().get("/*", async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/audio\//, ""));
  const wantsPrivate = c.req.query("b") === "private";

  if (!wantsPrivate) {
    const obj = await c.env.R2_PUBLIC.get(key);
    if (!obj) throw new HTTPException(404, { message: "audio not found" });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    // Content-addressed and published: this object can never change.
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("accept-ranges", "bytes");
    return new Response(obj.body, { headers });
  }

  const v = await verifyAudioUrl(
    c.env.AUDIO_SIGNING_SECRET,
    c.req.query("b") ?? "",
    key,
    c.req.query("exp") ?? "",
    c.req.query("sig") ?? "",
  );
  if (!v.ok) throw new HTTPException(403, { message: v.reason });
  const actor = c.get("actor");
  if (!actor || !actor.roles.some((r) => r === "editor" || r === "admin")) {
    throw new HTTPException(403, { message: "editor session required for unpublished audio" });
  }
  const obj = await c.env.R2_PRIVATE.get(key);
  if (!obj) throw new HTTPException(404, { message: "audio not found" });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "private, no-store");
  headers.set("accept-ranges", "bytes");
  return new Response(obj.body, { headers });
});
