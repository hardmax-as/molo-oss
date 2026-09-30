/**
 * Sentry REST reads for `molo sentry issues|issue`. The org lives in the EU
 * region (de.sentry.io, docs/STACK.md). SENTRY_AUTH_TOKEN is the deploy's
 * org:ci token, which can upload source maps but not read issues, so reads
 * prefer SENTRY_READ_TOKEN. Event summaries drop user, IP and request data.
 */
import { envVar } from "../context.ts";
import { parseTime, stripQuery } from "./workers-logs.ts";

export const SENTRY_HOST = "https://de.sentry.io";
export const SENTRY_ORG = "malmo-development";
/** The Sentry projects Molo reports to; `--project` offers exactly these. */
export const SENTRY_PROJECTS = ["molo-api", "molo-web", "molo-mobile"] as const;

const DAY_MS = 86_400_000;

/**
 * The project issues endpoint accepts only `statsPeriod=24h` or `14d` (any
 * other value is a 400). A window up to a day asks for 24h, anything longer
 * for 14d, and the caller keeps the issues last seen after `cutoff`, so
 * `--since 1h` or `--since 3d` mean what they say. Longer than 14 days is
 * capped at Sentry's 14 (`capped`).
 */
export function issuesWindow(
  since: string,
  now: number,
): { statsPeriod: "24h" | "14d"; cutoff: number; capped: boolean } {
  const cutoff = parseTime(since, now);
  const span = now - cutoff;
  return {
    statsPeriod: span <= DAY_MS ? "24h" : "14d",
    cutoff,
    capped: span > 14 * DAY_MS,
  };
}

/** Issues whose `lastSeen` falls inside the window; an unreadable timestamp is kept. */
export function seenSince<T extends { lastSeen: string }>(issues: readonly T[], cutoff: number) {
  return issues.filter((i) => {
    const t = Date.parse(i.lastSeen);
    return Number.isNaN(t) || t >= cutoff;
  });
}
export const READ_SCOPES = ["org:read", "project:read", "event:read"] as const;

export interface SentryConfig {
  readonly host: string;
  readonly org: string;
  readonly token: string;
  readonly tokenVar: "SENTRY_READ_TOKEN" | "SENTRY_AUTH_TOKEN";
}

export function sentryConfig(): SentryConfig | undefined {
  const read = envVar("SENTRY_READ_TOKEN");
  const ci = envVar("SENTRY_AUTH_TOKEN");
  const token = read ?? ci;
  if (!token) return undefined;
  return {
    host: (envVar("SENTRY_URL") ?? SENTRY_HOST).replace(/\/$/, ""),
    org: envVar("SENTRY_ORG") ?? SENTRY_ORG,
    token,
    tokenVar: read ? "SENTRY_READ_TOKEN" : "SENTRY_AUTH_TOKEN",
  };
}

export function forbiddenMessage(tokenVar: string): string {
  return (
    `Sentry refused ${tokenVar} (403). Reads need a token with ${READ_SCOPES.join(", ")}; ` +
    "the deploy's org:ci token cannot read issues. Create one in Sentry: Settings → " +
    "Developer Settings → Custom Integrations → Create New Integration → Internal Integration, " +
    "grant Organization: Read, Project: Read and Issue & Event: Read, save, copy the token, " +
    "and put it in .env as SENTRY_READ_TOKEN (molo doctor reports whether it resolves)."
  );
}

export async function sentryGet<T>(cfg: SentryConfig, path: string): Promise<T> {
  const res = await fetch(`${cfg.host}/api/0${path}`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (res.status === 403 || res.status === 401) throw new Error(forbiddenMessage(cfg.tokenVar));
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// event summary
// ---------------------------------------------------------------------------

interface Frame {
  readonly filename?: string | null;
  readonly absPath?: string | null;
  readonly function?: string | null;
  readonly lineNo?: number | null;
  readonly colNo?: number | null;
  readonly inApp?: boolean | null;
}

interface Entry {
  readonly type: string;
  readonly data?: {
    readonly values?: ReadonlyArray<{
      readonly type?: string | null;
      readonly value?: string | null;
      readonly stacktrace?: { readonly frames?: readonly Frame[] | null } | null;
    }>;
  };
}

export interface SentryEvent {
  readonly eventID?: string;
  readonly dateCreated?: string;
  readonly title?: string;
  readonly culprit?: string | null;
  readonly platform?: string;
  readonly tags?: ReadonlyArray<{ readonly key: string; readonly value: string }>;
  readonly entries?: readonly Entry[];
}

export interface EventSummary {
  readonly eventId: string | null;
  readonly date: string | null;
  readonly title: string;
  readonly culprit: string | null;
  readonly tags: Record<string, string>;
  readonly exception: { type: string; value: string } | null;
  readonly frames: string[];
  readonly breadcrumbs: number;
}

/** Tags that identify a person or a device; never printed. */
const PII_TAG = /^(user(\..*)?|ip|client_ip|email|username|geo\..*|device\.id|url)$/i;

export function summariseEvent(e: SentryEvent, maxFrames = 8): EventSummary {
  const exc = e.entries?.find((x) => x.type === "exception")?.data?.values ?? [];
  // Sentry lists chained exceptions oldest first; the last one is what was thrown.
  const top = exc.at(-1);
  const frames = (top?.stacktrace?.frames ?? [])
    .toReversed()
    .filter((f, _, all) => f.inApp || !all.some((x) => x.inApp))
    .slice(0, maxFrames)
    .map((f) => {
      const file = stripQuery(f.filename ?? f.absPath ?? "?");
      const at = f.lineNo ? `:${f.lineNo}${f.colNo ? `:${f.colNo}` : ""}` : "";
      return `${f.function ?? "<anonymous>"} (${file}${at})`;
    });
  const breadcrumbs = e.entries?.find((x) => x.type === "breadcrumbs")?.data?.values?.length ?? 0;
  return {
    eventId: e.eventID ?? null,
    date: e.dateCreated ?? null,
    title: e.title ?? "",
    culprit: e.culprit ?? null,
    tags: Object.fromEntries(
      (e.tags ?? []).filter((t) => !PII_TAG.test(t.key)).map((t) => [t.key, t.value]),
    ),
    exception: top ? { type: top.type ?? "Error", value: stripQuery(top.value ?? "") } : null,
    frames,
    breadcrumbs,
  };
}
