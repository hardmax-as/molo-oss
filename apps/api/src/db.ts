import { createDb } from "@molo/db";
import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./env.ts";

/**
 * One postgres.js client per request over Hyperdrive (locally, wrangler's
 * `localConnectionString`). Closed after the response is sent.
 *
 * A Worker cannot keep a socket from one request for the next (the runtime
 * refuses I/O on behalf of another request), so "a persistent connection" is
 * not on the table; Hyperdrive is the persistent pool, one hop away. What a
 * request can do is use more than one connection at once: the learner routes
 * fan out two or three reads with `Promise.all`, and with `max: 1` postgres.js
 * queued them on a single socket, so they ran one after the other. Three
 * connections let them overlap. They are opened lazily and closed together,
 * and Hyperdrive caps what reaches the database (MOL-25).
 */
export const dbMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { db, close } = createDb(c.env.HYPERDRIVE.connectionString, { max: 3, prepare: false });
  c.set("db", db);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(
      Promise.allSettled(c.get("backgroundTasks") ?? []).then(() => close()),
    );
  }
};
