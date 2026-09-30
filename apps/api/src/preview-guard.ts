import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "./env.ts";

/** A flagged preview cannot mutate anything, even with a valid editor session. */
export const refusePreviewWrites: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const flagged = c.req.header("X-Molo-Preview") === "1" || c.req.query("preview") === "1";
    // Also refuse the obvious JSON flag; do not silently strip it at validation.
    let bodyFlag = false;
    if (c.req.header("Content-Type")?.includes("application/json")) {
      const body: unknown = await c.req.raw
        .clone()
        .json()
        .catch(() => null);
      bodyFlag = !!body && typeof body === "object" && "preview" in body && body.preview === true;
    }
    if (flagged || bodyFlag) throw new HTTPException(403, { message: "preview is read-only" });
  }
  await next();
};
