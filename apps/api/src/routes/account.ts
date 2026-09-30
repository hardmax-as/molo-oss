import { effectValidator } from "@hono/effect-validator";
import { LeagueProfileRequest, SetPasswordRequest } from "@molo/core";
import { setLeagueProfile } from "@molo/db";
import { weekStartOf } from "@molo/gamification";
import { Hono } from "hono";

import { createAuth } from "../auth.ts";
import type { AppEnv } from "../env.ts";
import { requireUser } from "../middleware.ts";
import { rateLimit } from "../ratelimit.ts";

/**
 * Settings → Account, the parts that are not Better Auth's own client
 * endpoints. Name, e-mail and password changes go straight to Better Auth
 * (`/update-user`, `/change-email`, `/change-password`); these two need the
 * API:
 *
 * - the league display name, refused by the same name filter the client
 *   checks first (`LeagueProfileRequest`);
 * - the first password on an account that signs in only with Apple or
 *   Google. Better Auth 1.7.2 offers `setPassword` on the server only, behind
 *   the session; it refuses an account that already has one, so this can
 *   never replace a password without the current one.
 *
 * Kept out of routes/me.ts so the auth integrity harness can load it (me.ts
 * imports WebAssembly).
 */
export const accountRoutes = new Hono<AppEnv>()
  .use("/me/league-profile", requireUser)
  .use("/me/password", requireUser)
  .put("/me/league-profile", effectValidator("json", LeagueProfileRequest), async (c) =>
    c.json(
      await setLeagueProfile(
        c.get("db"),
        c.get("actor")!.id,
        c.req.valid("json"),
        weekStartOf(new Date()),
      ),
    ),
  )
  .post(
    "/me/password",
    rateLimit("AUTH_LIMITER"),
    effectValidator("json", SetPasswordRequest),
    async (c) => {
      const res = await createAuth(c.env, c.get("db")).api.setPassword({
        body: { newPassword: c.req.valid("json").newPassword },
        headers: c.req.raw.headers,
        asResponse: true,
      });
      // Better Auth's own status, its code (PASSWORD_ALREADY_SET, …) in the
      // API's error envelope.
      const body = (await res.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      if (res.ok) return c.json({ ok: true });
      return c.json(
        { error: { code: body?.code ?? "invalid", message: body?.message ?? "refused" } },
        res.status as 400 | 401 | 403,
      );
    },
  );
