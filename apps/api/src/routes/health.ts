import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../env.ts";

export const healthRoutes = new Hono<AppEnv>()
  .get("/health", async (c) => {
    let database: "ok" | "error" = "ok";
    try {
      await c.get("db").execute(sql`select 1`);
    } catch {
      database = "error";
    }
    return c.json(
      { ok: database === "ok", environment: c.env.ENVIRONMENT, database },
      database === "ok" ? 200 : 503,
    );
  })
  .get("/debug/throw", (c) => {
    if (c.env.ENVIRONMENT === "prod") throw new HTTPException(404, { message: "not found" });
    throw new Error("deliberate error from /debug/throw (Sentry wiring check)");
  });
