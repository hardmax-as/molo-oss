import { effectValidator } from "@hono/effect-validator";
import { AppleAuthorizationCodeRequest } from "@molo/core";
import { storeAppleTokens } from "@molo/db";
import { Hono } from "hono";

import { exchangeAppleCode } from "../apple.ts";
import type { AppEnv } from "../env.ts";
import { requireUser } from "../middleware.ts";

/**
 * Native Sign in with Apple keeps no refresh token: Better Auth's id-token
 * sign-in stores only the identity token. The app therefore sends the sheet's
 * one-time authorization code here right after signing in or connecting
 * Apple, and the server exchanges it (bundle id + APPLE_APP_CLIENT_SECRET) for
 * a refresh token on the caller's own Apple account, which account deletion
 * revokes (App Store guideline 5.1.1(v)).
 *
 * Best effort by design: the app ignores the answer, and every outcome but a
 * stored token is `{ stored: false }` with a reason code. The code is never
 * logged, and the tokens never leave the server.
 */
export const appleRoutes = new Hono<AppEnv>()
  .use("/me/apple/*", requireUser)
  .post(
    "/me/apple/authorization-code",
    effectValidator("json", AppleAuthorizationCodeRequest),
    async (c) => {
      const uid = c.get("actor")!.id;
      const exchange = await exchangeAppleCode(c.req.valid("json").code, c.env);
      if (!exchange.ok) return c.json({ stored: false, reason: exchange.reason });
      const { tokens } = exchange;
      // Only the account whose Apple subject the code names: a code from some
      // other Apple ID never lands on this user.
      const stored = await storeAppleTokens(c.get("db"), uid, exchange.subject, {
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        idToken: tokens.idToken,
        accessTokenExpiresAt:
          tokens.expiresIn === null ? null : new Date(Date.now() + tokens.expiresIn * 1000),
      });
      return c.json(stored ? { stored: true } : { stored: false, reason: "no_account" });
    },
  );
