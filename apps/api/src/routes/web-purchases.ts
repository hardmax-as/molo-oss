import { effectValidator } from "@hono/effect-validator";
import { WebCheckoutRequest, WithdrawalRequest } from "@molo/core";
import {
  listWebPurchases,
  recordWebConsent,
  requestWebWithdrawal,
  WithdrawalError,
  schema,
} from "@molo/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppEnv } from "../env.ts";
import { requireUser } from "../middleware.ts";

export const webPurchaseRoutes = new Hono<AppEnv>()
  .use("*", requireUser)
  .post("/me/web-checkout", effectValidator("json", WebCheckoutRequest), async (c) => {
    const db = c.get("db");
    const userId = c.get("actor")!.id;
    const [user] = await db
      .select({ country: schema.users.country })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (user?.country !== "NO")
      return c.json(
        { error: { code: "web_checkout_country", message: "web_checkout_country" } },
        403,
      );
    return c.json(await recordWebConsent(db, userId, c.req.valid("json").productId));
  })
  .get("/me/web-purchases", async (c) =>
    c.json({ purchases: await listWebPurchases(c.get("db"), c.get("actor")!.id) }),
  )
  .post("/me/withdrawal", effectValidator("json", WithdrawalRequest), async (c) => {
    try {
      return c.json(
        await requestWebWithdrawal(c.get("db"), c.get("actor")!.id, c.req.valid("json").purchaseId),
      );
    } catch (error) {
      if (error instanceof WithdrawalError)
        return c.json(
          { error: { code: error.code, message: error.code } },
          error.code === "not_found" ? 404 : 409,
        );
      throw error;
    }
  });
