/**
 * Read-only views over pg_stat_activity and pg_stat_statements for
 * `molo db activity` and `molo db slow`. Query text can carry literal values
 * (emails, tokens) when a statement was not parameterised, so every query is
 * masked before it is shortened: a cut never leaves half a literal behind.
 * The SQL itself lives in packages/db (`@molo/db/pg-stats`).
 */
export const QUERY_CHARS = 120;

/** Strings, dollar-quoted bodies, E'' / B'' / X'' literals and numbers become `?`. */
export function maskQuery(query: string, max = QUERY_CHARS): string {
  const masked = query
    .replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, "?")
    .replace(/(?:\b[EeBbXx])?'(?:[^']|'')*'/g, "?")
    .replace(/'(?:[^']|'')*$/g, "?")
    .replace(/(?<![\w$])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, "?")
    .replace(/\s+/g, " ")
    .trim();
  return masked.length > max ? `${masked.slice(0, max - 1)}…` : masked;
}

export interface ActivityRow {
  readonly pid: number;
  readonly backend: string;
  readonly application: string;
  readonly state: string;
  readonly waitEvent: string;
  readonly querySeconds: number | null;
  readonly xactSeconds: number | null;
  readonly query: string;
}

const secs = (v: unknown): number | null =>
  v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10;

export function toActivity(rows: readonly Record<string, unknown>[]): ActivityRow[] {
  return rows.map((r) => ({
    pid: Number(r["pid"]),
    backend: String(r["backend_type"] ?? ""),
    application: String(r["application"] ?? ""),
    state: String(r["state"] ?? ""),
    waitEvent: String(r["wait_event"] ?? ""),
    querySeconds: secs(r["query_seconds"]),
    xactSeconds: secs(r["xact_seconds"]),
    query: maskQuery(String(r["query"] ?? "")),
  }));
}

export interface SlowRow {
  readonly calls: number;
  readonly totalMs: number;
  readonly meanMs: number;
  readonly maxMs: number;
  readonly rows: number;
  readonly query: string;
}

export function toSlow(rows: readonly Record<string, unknown>[]): SlowRow[] {
  return rows.map((r) => ({
    calls: Number(r["calls"]),
    totalMs: Number(r["total_ms"]),
    meanMs: Number(r["mean_ms"]),
    maxMs: Number(r["max_ms"]),
    rows: Number(r["rows"]),
    query: maskQuery(String(r["query"] ?? "")),
  }));
}
