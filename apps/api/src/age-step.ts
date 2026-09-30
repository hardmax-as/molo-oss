import { AGE_REQUIRED } from "@molo/core";
import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "./env.ts";

/**
 * What a signed-in account that still owes its age declaration may reach: who
 * am I (`GET /me`, which says `ageRequired`), the age step itself, and the
 * learner's rights over the account — export, deletion, and forgetting the
 * device's push token on sign-out — and the native Apple code exchange the app
 * sends right after signing in, so deletion can revoke the grant. Sign-out itself is Better Auth's, under
 * /api/auth, which this middleware never sees. Legal pages are static web
 * pages, not API routes.
 */
const OPEN: ReadonlySet<string> = new Set([
  "GET /me",
  "POST /me/age",
  "POST /me/apple/authorization-code",
  "DELETE /me",
  "GET /me/export",
  "DELETE /me/push-token",
  "GET /health",
  "GET /auth/providers",
]);

export function ageStepAllows(method: string, path: string): boolean {
  const bare = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  // Store and payment webhooks authenticate by signature, never by a learner's session.
  if (bare.startsWith("/webhooks/")) return true;
  return OPEN.has(`${method.toUpperCase()} ${bare}`);
}

/**
 * The server half of the age step (docs/ARCHITECTURE.md, "Registration age
 * gate"): while the session's user is age-pending, every other route answers
 * 403 `age_required`, whatever the client does or does not show.
 */
export const requireAgeConfirmed: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("ageRequired") === true && !ageStepAllows(c.req.method, c.req.path)) {
    return c.json(
      {
        error: {
          code: AGE_REQUIRED,
          message: "confirm your birth year and country before using Molo",
        },
      },
      403,
    );
  }
  await next();
};
