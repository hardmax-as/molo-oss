/**
 * Historical Workers Logs through the Workers Observability telemetry query
 * API (library notes). Everything
 * here but `queryTelemetry` is pure, so the request body, the filter mapping
 * and the formatter are unit-tested without a network.
 */
import type { EnvName } from "../root.ts";

export const APPS = ["api", "web"] as const;
export type App = (typeof APPS)[number];

/** The deployed Worker's script name: infra/alchemy.run.ts names them molo-<app>-<stage>. */
export function workerName(app: App, env: EnvName): string {
  return `molo-${app}-${env}`;
}

// ---------------------------------------------------------------------------
// time
// ---------------------------------------------------------------------------

const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/**
 * `1h`, `30m`, `2d`, `90s` mean that long before `now`; anything else must
 * parse as a date (`2026-09-25T04:00Z`). Returns epoch milliseconds.
 */
export function parseTime(input: string, now: number): number {
  const m = /^(\d+)\s*([smhd])$/.exec(input.trim());
  if (m) return now - Number(m[1]) * UNIT_MS[m[2] as keyof typeof UNIT_MS];
  const t = Date.parse(input);
  if (Number.isNaN(t))
    throw new Error(`cannot read "${input}" as a duration (1h, 30m, 2d) or a date`);
  return t;
}

// ---------------------------------------------------------------------------
// filters and the request body
// ---------------------------------------------------------------------------

export interface TelemetryFilter {
  readonly key: string;
  readonly operation: string;
  readonly type: "string" | "number";
  readonly value: string | number;
}

export interface LogsOptions {
  readonly service: string;
  readonly from: number;
  readonly to: number;
  readonly limit: number;
  readonly grep?: string | undefined;
  readonly status?: string | undefined;
  readonly level?: "error" | "warn" | undefined;
}

/**
 * `500` → one exact status; `5xx` / `4xx` → the class. Status lives only on
 * request events (`cf-worker-event`), level only on console lines
 * (`cf-worker`); the second pass (`requestIdFilter`) fetches the rest of each
 * matched request.
 */
export function statusFilters(status: string): TelemetryFilter[] {
  const key = "$workers.event.response.status";
  const s = status.trim().toLowerCase();
  const cls = /^([1-5])xx$/.exec(s);
  if (cls) {
    const lo = Number(cls[1]) * 100;
    return [
      { key, operation: "gte", type: "number", value: lo },
      { key, operation: "lt", type: "number", value: lo + 100 },
    ];
  }
  if (/^[1-5]\d\d$/.test(s)) return [{ key, operation: "eq", type: "number", value: Number(s) }];
  throw new Error(`--status takes a code (500) or a class (4xx, 5xx), not "${status}"`);
}

export function filtersFor(o: LogsOptions): TelemetryFilter[] {
  const f: TelemetryFilter[] = [
    { key: "$metadata.service", operation: "eq", type: "string", value: o.service },
  ];
  // A request event's message is "GET <url>", a console line's is its text:
  // one `includes` covers both paths and log output.
  if (o.grep)
    f.push({ key: "$metadata.message", operation: "includes", type: "string", value: o.grep });
  if (o.status) f.push(...statusFilters(o.status));
  if (o.level === "error")
    f.push({ key: "$metadata.level", operation: "eq", type: "string", value: "error" });
  if (o.level === "warn")
    f.push({ key: "$metadata.level", operation: "in", type: "string", value: "warn,error" });
  return f;
}

/** True when the first pass may have matched only part of a request. */
export function needsSecondPass(o: LogsOptions): boolean {
  return Boolean(o.grep || o.status || o.level);
}

/** The API's `in` takes a comma-separated string (an array is a 400). */
export function requestIdFilter(service: string, ids: readonly string[]): TelemetryFilter[] {
  return [
    { key: "$metadata.service", operation: "eq", type: "string", value: service },
    { key: "$metadata.requestId", operation: "in", type: "string", value: ids.join(",") },
  ];
}

export function queryBody(
  filters: readonly TelemetryFilter[],
  timeframe: { from: number; to: number },
  limit: number,
) {
  return {
    queryId: "adhoc",
    timeframe,
    view: "events",
    limit,
    parameters: { filters },
  };
}

// ---------------------------------------------------------------------------
// events: the fields we read, and the projection we print
// ---------------------------------------------------------------------------

/** The subset of a telemetry event the CLI reads; the rest (headers, IPs, geo) is dropped. */
export interface RawEvent {
  readonly timestamp: number;
  readonly $metadata: {
    readonly id?: string;
    readonly requestId?: string;
    readonly type?: string;
    readonly level?: string;
    readonly message?: string;
    readonly error?: string;
    readonly trigger?: string;
  };
  readonly $workers?: {
    readonly outcome?: string;
    readonly wallTimeMs?: number;
    readonly event?: {
      readonly request?: { readonly method?: string; readonly url?: string };
      readonly response?: { readonly status?: number };
    };
  };
}

export interface LogLine {
  readonly time: string;
  readonly level: string;
  readonly message: string;
}

export interface RequestGroup {
  readonly requestId: string;
  readonly time: string;
  readonly method: string | null;
  readonly path: string | null;
  readonly status: number | null;
  readonly outcome: string | null;
  readonly wallTimeMs: number | null;
  readonly logs: LogLine[];
}

/** Query strings can carry tokens and codes; the API redacts some, we drop them all. */
export function stripQuery(text: string): string {
  return text.replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/g, "$1");
}

function pathOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return stripQuery(url).split("?")[0] ?? null;
  }
}

/** Groups console lines under their request, oldest request first. */
export function groupEvents(events: readonly RawEvent[]): RequestGroup[] {
  const byId = new Map<
    string,
    { first: number; req: RawEvent | null; any: RawEvent; logs: RawEvent[]; seen: Set<string> }
  >();
  for (const e of events) {
    const id = e.$metadata.requestId ?? e.$metadata.id ?? `${e.timestamp}`;
    let g = byId.get(id);
    if (!g) {
      g = { first: e.timestamp, req: null, any: e, logs: [], seen: new Set() };
      byId.set(id, g);
    }
    // The second pass returns events the first pass already had.
    const key = e.$metadata.id ?? `${e.timestamp}:${e.$metadata.message}`;
    if (g.seen.has(key)) continue;
    g.seen.add(key);
    g.first = Math.min(g.first, e.timestamp);
    if (e.$metadata.type === "cf-worker-event") g.req = e;
    else g.logs.push(e);
  }
  return [...byId.entries()]
    .map(([requestId, g]): RequestGroup => {
      const r = g.req ?? g.any;
      const req = r.$workers?.event?.request;
      const trigger = g.req ? undefined : r.$metadata.trigger;
      return {
        requestId,
        time: new Date(g.first).toISOString(),
        method: req?.method ?? trigger?.split(" ")[0] ?? null,
        path:
          pathOf(req?.url) ?? (trigger ? (trigger.split(" ")[1] ?? "").split(/[?#]/)[0]! : null),
        status: g.req?.$workers?.event?.response?.status ?? null,
        outcome: g.req?.$workers?.outcome ?? null,
        wallTimeMs: g.req?.$workers?.wallTimeMs ?? null,
        logs: g.logs
          .toSorted((a, b) => a.timestamp - b.timestamp)
          .map((l) => ({
            time: new Date(l.timestamp).toISOString(),
            level: l.$metadata.level ?? "log",
            message: stripQuery(l.$metadata.error ?? l.$metadata.message ?? ""),
          })),
      };
    })
    .toSorted((a, b) => a.time.localeCompare(b.time));
}

/** One line per request, console lines indented beneath it. */
export function formatGroups(groups: readonly RequestGroup[]): string[] {
  const lines: string[] = [];
  for (const g of groups) {
    const status = g.status === null ? (g.outcome ?? "-") : String(g.status);
    const ms = g.wallTimeMs === null ? "" : `  ${g.wallTimeMs}ms`;
    lines.push(`${g.time}  ${status.padEnd(3)}  ${g.method ?? "-"} ${g.path ?? "-"}${ms}`);
    for (const l of g.logs) {
      const msg = l.message.length > 400 ? `${l.message.slice(0, 400)}…` : l.message;
      lines.push(`    ${l.level.padEnd(5)} ${msg.replace(/\n/g, "\n          ")}`);
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// network
// ---------------------------------------------------------------------------

export async function queryTelemetry(
  accountId: string,
  token: string,
  body: ReturnType<typeof queryBody>,
): Promise<RawEvent[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/observability/telemetry/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: { message?: string }[];
    result?: { events?: { events?: RawEvent[] } };
  };
  if (!res.ok || json.success === false) {
    const why = json.errors?.map((e) => e.message).join("; ") || res.statusText;
    const hint =
      res.status === 403 || res.status === 401
        ? " (CLOUDFLARE_API_TOKEN needs Workers Observability read on the account)"
        : "";
    throw new Error(`${res.status} ${why}${hint}`);
  }
  return json.result?.events?.events ?? [];
}
