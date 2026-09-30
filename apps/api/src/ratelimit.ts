/**
 * Rate limiting on the endpoints where one caller can cost everybody else:
 * sign-in, sign-up and magic links (credential stuffing, mailbox spam), the
 * RevenueCat webhook (noise), and "report this exercise" (an editor's queue).
 *
 * Uses the Workers rate-limiting binding (`ratelimits` in wrangler.jsonc).
 * Without it — some local runs, and any environment where the binding was
 * not provisioned — this is a pass-through rather than a lock-out, because
 * failing closed would take the whole app down with the limiter.
 */

import type { MiddlewareHandler } from "hono";

import type { AppEnv, Bindings } from "./env.ts";

export type LimiterName = "AUTH_LIMITER" | "WEBHOOK_LIMITER" | "REPORT_LIMITER";

function clientKey(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous"
  );
}

/**
 * Consumes one token for `key`. True means "go ahead", and an unreachable or
 * unbound limiter is also true — see the fail-open note above.
 */
export async function consume(env: Bindings, which: LimiterName, key: string): Promise<boolean> {
  const limiter = env[which];
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key: `${which}:${key}` })).success;
  } catch (e) {
    console.warn(`[ratelimit] ${which} unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return true;
  }
}

/** Per-IP, for the endpoints that take input from someone with no account. */
export function rateLimit(which: "AUTH_LIMITER" | "WEBHOOK_LIMITER"): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (await consume(c.env, which, clientKey(c.req.raw.headers))) return next();
    return c.json(
      { error: { code: "rate_limited", message: "too many requests, try again in a minute" } },
      429,
      { "retry-after": "60" },
    );
  };
}

/**
 * Per-account, for "report this exercise".
 *
 * The repository already refuses a second open report with the same reason on
 * the same exercise, which caps one learner at five rows per exercise. It does
 * not cap them across the app, so one account could still walk the course
 * filing reports faster than an editor can read them. `REPORT_LIMITER` is
 * five per minute (wrangler.jsonc; the binding's period may only be 10 or 60
 * seconds).
 *
 * Five was chosen because filing a report means opening the sheet, choosing
 * one of five reasons, usually typing a sentence, and sending — a learner who
 * has genuinely found five broken exercises inside sixty seconds is not
 * writing notes on any of them. It is a burst cap, not a daily quota: a
 * patient script can still drip, and the answer to that is suspending the
 * account, not a smaller number here.
 *
 * The refusal is a 429 with its own code so the clients can say *why* rather
 * than showing the generic "that did not send".
 */
export const reportRateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const actor = c.get("actor");
  // No session: `requireUser` answers 401 first, so there is nothing to meter.
  if (!actor) return next();
  if (await consume(c.env, "REPORT_LIMITER", actor.id)) return next();
  return c.json(
    {
      error: {
        code: "report_rate_limited",
        message: "too many reports in a minute, try again shortly",
      },
    },
    429,
    { "retry-after": "60" },
  );
};
