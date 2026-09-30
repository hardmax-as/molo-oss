import { createAuthMiddleware } from "better-auth/api";

/**
 * One readable Workers log line for every failed social sign-in, OAuth
 * callback, link or unlink, e.g.
 *
 *   auth.social_failed provider=apple path=/sign-in/social status=401 code=OAUTH_LINK_ERROR reason="signup disabled"
 *
 * Only the provider, route, status and Better Auth's own error code and
 * message go out. Never tokens, e-mail addresses, OAuth codes, state or query
 * strings: a callback's redirect is reduced to its `error` code.
 */

const PATHS = new Set(["/sign-in/social", "/callback/:id", "/link-social", "/unlink-account"]);

// Better Auth codes and provider error codes are short identifiers; anything else is dropped.
const CODE = /^[A-Za-z0-9_.-]{1,64}$/;
// Better Auth's fixed messages ("signup disabled", "Invalid token", ...). An @ or
// anything outside this alphabet could be user data, so it is not logged at all.
const REASON = /^[A-Za-z0-9 _.,:'()-]{1,100}$/;
const PROVIDER = /^[a-z0-9-]{1,32}$/;

export interface SocialOutcome {
  path: string | undefined;
  params?: Record<string, unknown> | undefined;
  body?: unknown;
  returned: unknown;
  location?: string | null | undefined;
}

function field(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && pattern.test(value) && !value.includes("@") ? value : null;
}

function errorParts(returned: unknown): { status: number; code: unknown; message: unknown } | null {
  if (typeof returned !== "object" || returned === null) return null;
  const r = returned as { statusCode?: unknown; body?: unknown };
  if (typeof r.statusCode !== "number") return null;
  const body = (typeof r.body === "object" && r.body !== null ? r.body : {}) as {
    code?: unknown;
    message?: unknown;
  };
  return { status: r.statusCode, code: body.code, message: body.message };
}

/** The log line for a failed social auth request, or null when there is nothing to report. */
export function socialFailureLine(o: SocialOutcome): string | null {
  if (!o.path || !PATHS.has(o.path)) return null;
  const err = errorParts(o.returned);
  if (!err) return null;
  const provider =
    o.path === "/callback/:id"
      ? field(o.params?.["id"], PROVIDER)
      : field((o.body as { provider?: unknown } | undefined)?.provider, PROVIDER);
  let code: string | null;
  let reason: string | null = null;
  if (err.status >= 300 && err.status < 400) {
    // A callback reports failure by redirecting with ?error=<code>; success redirects without it.
    let error: string | null = null;
    try {
      error = o.location ? new URL(o.location).searchParams.get("error") : null;
    } catch {
      error = null;
    }
    if (!error) return null;
    code = field(error, CODE) ?? "unreadable";
  } else if (err.status >= 400) {
    code = field(err.code, CODE) ?? "unknown";
    reason = field(err.message, REASON);
  } else {
    return null;
  }
  return [
    "auth.social_failed",
    `provider=${provider ?? "unknown"}`,
    `path=${o.path}`,
    `status=${err.status}`,
    `code=${code}`,
    ...(reason ? [`reason="${reason}"`] : []),
  ].join(" ");
}

/** Better Auth `hooks.after`: runs after every endpoint, including the ones that failed. */
export const logSocialFailures = createAuthMiddleware(async (ctx) => {
  const line = socialFailureLine({
    path: ctx.path,
    params: ctx.params as Record<string, unknown> | undefined,
    body: ctx.body,
    returned: ctx.context.returned,
    location: ctx.context.responseHeaders?.get("location"),
  });
  if (line) console.warn(line);
});
