import { AGE_INVALID, AGE_UNDER_MINIMUM, ageEligibility, type AgeDeclaration } from "@molo/core";
import { confirmPendingAge, isAgePending } from "@molo/db";
import { Hono } from "hono";

import { deleteAccount } from "../account-deletion.ts";
import { createAuth } from "../auth.ts";
import type { AppEnv } from "../env.ts";
import { requireUser } from "../middleware.ts";
import { announceCompletedMember } from "../slack-events.ts";

/**
 * The age step after a one-tap Apple or Google sign-up (docs/ARCHITECTURE.md,
 * "Registration age gate"). The declaration is checked by the same
 * `ageEligibility` rule as e-mail sign-up, and the same two facts are kept:
 * eligibility and the validated country. The birth year and the birthday
 * confirmation are read here and never stored.
 *
 * Below the minimum age the account and everything it holds are deleted at
 * once, through the same path as "Delete account", and the session ends.
 */
export const ageRoutes = new Hono<AppEnv>()
  .use("/me/age", requireUser)
  .post("/me/age", async (c) => {
    const db = c.get("db");
    const uid = c.get("actor")!.id;
    // An account that is not waiting for the step has nothing to confirm; an
    // earlier answer is never rewritten.
    if (!(await isAgePending(db, uid))) return c.json({ ageRequired: false });
    const raw: unknown = await c.req.json().catch(() => null);
    const result = ageEligibility(raw);
    if (!result.ok) {
      if (result.reason === "under13" || result.reason === "under18ZA") {
        // End the session first so the response can expire its cookie; the
        // deletion below removes every session row of this user in any case.
        const cookies = await endSession(c);
        await deleteAccount(db, c.env, uid);
        for (const cookie of cookies) c.header("set-cookie", cookie, { append: true });
        return c.json(
          {
            error: {
              code: AGE_UNDER_MINIMUM,
              message: "below the minimum age for Molo: the account has been deleted",
              details: { reason: result.reason },
            },
          },
          403,
        );
      }
      return c.json(
        {
          error: {
            code: AGE_INVALID,
            message: "enter a birth year and a country",
            details: { reason: result.reason },
          },
        },
        400,
      );
    }
    // ageEligibility decoded and validated the declaration, so its country is one of the three.
    const completed = await confirmPendingAge(db, uid, (raw as AgeDeclaration).country);
    const response = c.json({ ageRequired: false });
    c.res = response;
    // Only the successful pending -> confirmed update announces; retries and races do not.
    if (completed) announceCompletedMember(c, uid);
    return response;
  });

/** Better Auth's own sign-out for this request: the session row and its cookies. */
async function endSession(c: {
  env: AppEnv["Bindings"];
  get: (k: "db") => AppEnv["Variables"]["db"];
  req: { raw: Request };
}): Promise<string[]> {
  try {
    const out = await createAuth(c.env, c.get("db")).api.signOut({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    return out.headers.getSetCookie();
  } catch {
    return [];
  }
}
