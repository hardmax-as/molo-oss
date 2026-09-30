import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";

import { banner, envVar, fail, out, tryPromise } from "../context.ts";
import { molo } from "../root.ts";
import {
  APPS,
  filtersFor,
  formatGroups,
  groupEvents,
  needsSecondPass,
  parseTime,
  queryBody,
  queryTelemetry,
  requestIdFilter,
  workerName,
  type LogsOptions,
} from "../services/workers-logs.ts";

/** Upper bound for the second pass that fetches every line of the matched requests. */
const SECOND_PASS_LIMIT = 2000;

/**
 * `molo logs [api|web]`: historical Workers Logs (7 days retained), read-only.
 * `molo cf tail` remains the live stream.
 */
export const logs = Command.make(
  "logs",
  {
    app: Args.choice(APPS.map((a) => [a, a] as const)).pipe(Args.withDefault("api" as const)),
    since: Options.text("since").pipe(
      Options.withDefault("1h"),
      Options.withDescription("Start: a duration ago (1h, 30m, 2d) or a date"),
    ),
    until: Options.text("until").pipe(
      Options.optional,
      Options.withDescription("End: a duration ago or a date; default now"),
    ),
    grep: Options.text("grep").pipe(
      Options.optional,
      Options.withDescription("Substring of the request line (method + url) or a log message"),
    ),
    status: Options.text("status").pipe(
      Options.optional,
      Options.withDescription("Response status: 500, 4xx, 5xx"),
    ),
    level: Options.choice("level", ["error", "warn"] as const).pipe(
      Options.optional,
      Options.withDescription("Only requests that logged at this level or above"),
    ),
    limit: Options.integer("limit").pipe(
      Options.withDefault(100),
      Options.withDescription("Events fetched by the first pass"),
    ),
  },
  ({ app, since, until, grep, status, level, limit }) =>
    Effect.gen(function* () {
      const g = yield* molo;
      if (g.env === "local")
        return yield* fail(
          "logs reads deployed Workers: --env preview|prod (local logs are in your terminal)",
        );
      const accountId = envVar("CLOUDFLARE_ACCOUNT_ID");
      const token = envVar("CLOUDFLARE_API_TOKEN");
      if (!accountId || !token)
        return yield* fail(
          "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required (see molo doctor)",
        );
      const now = Date.now();
      const opts: LogsOptions = yield* Effect.try({
        try: () => ({
          service: workerName(app, g.env),
          from: parseTime(since, now),
          to: Option.match(until, { onNone: () => now, onSome: (u) => parseTime(u, now) }),
          limit,
          grep: Option.getOrUndefined(grep),
          status: Option.getOrUndefined(status),
          level: Option.getOrUndefined(level),
        }),
        catch: (e) => e,
      }).pipe(Effect.catchAll((e) => fail(e instanceof Error ? e.message : String(e))));
      if (opts.from >= opts.to) return yield* fail("--since must be before --until");
      banner(g.env);

      const timeframe = { from: opts.from, to: opts.to };
      let events = yield* tryPromise(
        () => queryTelemetry(accountId, token, queryBody(filtersFor(opts), timeframe, limit)),
        "workers observability",
      );
      if (needsSecondPass(opts) && events.length > 0) {
        const ids = [...new Set(events.map((e) => e.$metadata.requestId).filter((x) => !!x))];
        if (ids.length > 0) {
          const rest = yield* tryPromise(
            () =>
              queryTelemetry(
                accountId,
                token,
                queryBody(
                  requestIdFilter(opts.service, ids as string[]),
                  timeframe,
                  SECOND_PASS_LIMIT,
                ),
              ),
            "workers observability",
          );
          events = [...events, ...rest];
        }
      }
      const groups = groupEvents(events);
      const summary = {
        service: opts.service,
        from: new Date(opts.from).toISOString(),
        to: new Date(opts.to).toISOString(),
        filters: {
          grep: opts.grep ?? null,
          status: opts.status ?? null,
          level: opts.level ?? null,
        },
        requests: groups,
      };
      yield* out(g, summary, () => {
        console.log(
          `${opts.service}  ${summary.from} → ${summary.to}  ${groups.length} request(s)` +
            (events.length >= limit
              ? `  (first pass hit --limit ${limit}; narrow the window)`
              : ""),
        );
        for (const line of formatGroups(groups)) console.log(line);
      });
    }),
).pipe(
  Command.withDescription(
    "Historical Workers Logs from Cloudflare (read-only); query strings are stripped",
  ),
);
