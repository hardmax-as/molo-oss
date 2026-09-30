#!/usr/bin/env bun
/**
 * Molo infrastructure as code (STACK.md: Alchemy 0.94, Cloudflare).
 *
 *   bun infra/alchemy.run.ts --stage preview             # dry run: reads state, changes nothing
 *   MOLO_LIVE=1 bun infra/alchemy.run.ts --stage preview # apply (what `molo cf deploy --live` runs)
 *   MOLO_LIVE=1 MOLO_DESTROY=1 bun infra/alchemy.run.ts --stage preview
 *
 * Nothing here runs without the credentials below, and nothing runs at all
 * unless MOLO_LIVE=1 (the project rules non-negotiable 4). Stages: preview
 * (per-PR when PR_NUMBER is set), prod. Secrets are passed as Alchemy
 * secrets from the environment; values never appear in state in the clear.
 *
 * Required environment:
 *   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, ALCHEMY_PASSWORD
 *   <STAGE>_DATABASE_URL (PlanetScale Postgres connection string for the Hyperdrive origin)
 *   ALCHEMY_STATE_TOKEN (the state Worker's shared secret; same value everywhere)
 *   BETTER_AUTH_SECRET, AUDIO_SIGNING_SECRET; optional SENTRY_DSN, RESEND_API_KEY,
 *   RESEND_FROM, SLACK_WEBHOOK_URL, SLACK_SIGNUPS_WEBHOOK_URL, SLACK_SUBSCRIPTIONS_WEBHOOK_URL, EXPO_ACCESS_TOKEN, REVENUECAT_WEBHOOK_SECRET, APPLE_CLIENT_ID,
 *   APPLE_CLIENT_SECRET, APPLE_APP_BUNDLE_IDENTIFIER, APPLE_APP_CLIENT_SECRET, GOOGLE_CLIENT_ID,
 *   GOOGLE_CLIENT_SECRET
 */

import { execFileSync } from "node:child_process";

import alchemy from "alchemy";
import { Hyperdrive, Queue, R2Bucket, RateLimit, TanStackStart, Worker } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

import { sentryBuildOptions } from "./src/sentry-build.ts";
import { sentryWorkerPlugins } from "./src/sentry-worker.ts";

type Stage = "preview" | "prod";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const live = process.env["MOLO_LIVE"] === "1";
const destroy = process.env["MOLO_DESTROY"] === "1";
const stageArg = arg("stage") ?? "preview";
if (stageArg !== "preview" && stageArg !== "prod") {
  console.error(`--stage must be preview or prod (got ${stageArg})`);
  process.exit(2);
}
const stage: Stage = stageArg;
const prNumber = process.env["PR_NUMBER"];
/** Per-PR previews get their own stage name so their resources are isolated. */
const stageName = stage === "preview" && prNumber ? `preview-pr-${prNumber}` : stage;

const environment = stage === "prod" ? "prod" : "preview";
const apiHost = stage === "prod" ? "api.hellomolo.com" : `api-${stageName}.hellomolo.com`;
const webHost = stage === "prod" ? "hellomolo.com" : `${stageName}.hellomolo.com`;

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is not set`);
    process.exit(2);
  }
  return v;
}

if (!live) {
  // The dry run never constructs the Alchemy app: no state store, no
  // credentials, no network. It prints what would be applied and exits.
  console.log(
    `dry run: would ${destroy ? "DESTROY" : "deploy"} api and web for stage ${stageName}. Set MOLO_LIVE=1 to apply.`,
  );
  console.log(`resources for stage ${stageName}:`);
  for (const line of [
    `R2 buckets  molo-public-${stageName} (public), molo-private-${stageName}`,
    `Queues      molo-audio-process-${stageName} (+ dlq), molo-ingest-${stageName}, molo-forvo-backfill-${stageName}`,
    `            audio-process pull consumer, dead letters, retention: molo cf queues --env ${stage} --live (after this)`,
    `Hyperdrive  molo-db-${stageName} (query cache off) -> ${stage === "prod" ? "PROD_DATABASE_URL" : "PREVIEW_DATABASE_URL"} host`,
    `Hyperdrive  molo-db-cached-${stageName} (query cache 60s) -> same origin, published reads only`,
    `RateLimit   AUTH_LIMITER 20/60s, WEBHOOK_LIMITER 120/60s, REPORT_LIMITER 5/60s`,
    `Worker      molo-api-${stageName} at https://${apiHost} (apps/api/src/index.ts; consumers: ingest, forvo-backfill)`,
    `Worker      molo-web-${stageName} at https://${webHost} (apps/web, built by vite; www. redirects there)`,
  ])
    console.log(`  ${line}`);
  process.exit(0);
}

const release =
  process.env["SENTRY_RELEASE"] ??
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(release)) throw new Error("SENTRY_RELEASE must be the full git SHA");
const apiSentry = sentryBuildOptions("molo-api", { ...process.env, SENTRY_RELEASE: release });
if (!apiSentry && !destroy)
  console.log("Sentry source map uploads skipped: SENTRY_AUTH_TOKEN is absent.");

const app = await alchemy("molo", {
  stage: stageName,
  phase: destroy ? "destroy" : "up",
  password: need("ALCHEMY_PASSWORD"),
  // State lives on Cloudflare, not in .alchemy/: a CI runner starts empty,
  // and Alchemy refuses to run in CI on the local store because that is how
  // resources get orphaned. The script name is ours; the account already
  // carries other projects' `alchemy-state-service`, each bound to its own
  // ALCHEMY_STATE_TOKEN, and one token cannot serve two.
  stateStore: (scope) =>
    new CloudflareStateStore(scope, {
      scriptName: "molo-alchemy-state",
      stateToken: alchemy.secret(need("ALCHEMY_STATE_TOKEN")),
    }),
});

const dbUrlVar = stage === "prod" ? "PROD_DATABASE_URL" : "PREVIEW_DATABASE_URL";
const dbUrl = new URL(need(dbUrlVar));

// ---- storage ---------------------------------------------------------------
const publicBucket = await R2Bucket("public", {
  name: `molo-public-${stageName}`,
  allowPublicAccess: true,
  adopt: true,
});
const privateBucket = await R2Bucket("private", {
  name: `molo-private-${stageName}`,
  adopt: true,
});

// ---- queues ----------------------------------------------------------------
// audio-process has no Worker consumer: `molo audio worker` pulls it over
// HTTP (it runs the native xh-audio binary), from the scheduled GitHub
// workflow .github/workflows/audio-worker.yml. Alchemy 0.94 can declare
// neither an HTTP pull consumer (its QueueConsumer is Worker-only) nor a
// dead-letter queue on one (Queue's `dlq` is stored, never sent), so the
// deploy runs `molo cf queues --live` after this script to attach both and
// set retention. The dead-letter queue itself is declared here so a stage's
// destroy takes it along.
await Queue("audio-process-dlq", {
  name: `molo-audio-process-dlq-${stageName}`,
  adopt: true,
});
const audioQueue = await Queue("audio-process", {
  name: `molo-audio-process-${stageName}`,
  adopt: true,
});
const ingestQueue = await Queue("ingest", { name: `molo-ingest-${stageName}`, adopt: true });
const forvoQueue = await Queue("forvo-backfill", {
  name: `molo-forvo-backfill-${stageName}`,
  adopt: true,
});

// ---- database hop ----------------------------------------------------------
// Two configurations over one database, because Hyperdrive's query cache is
// TTL-only: it never invalidates on a write (Cloudflare, "Query caching",
// read-after-write behaviour). One cached config for everything would serve a
// stale session, a stale role and a stale XP total for up to max_age, which is
// the one thing docs/CACHING.md section 3 forbids. So:
//
//   HYPERDRIVE         caching off. The default for everything: auth,
//                      sessions, roles, learner state, and every write.
//   HYPERDRIVE_CACHED  caching on, 60s. Published content reads only.
//
// Caching is ON by default in Hyperdrive (max_age 60, stale_while_revalidate
// 15), so `disabled: true` on the first config is load-bearing, not
// decorative: it turns off a cache we already had and had not reasoned about.
const origin = {
  host: dbUrl.hostname,
  port: Number(dbUrl.port || 5432),
  database: dbUrl.pathname.replace(/^\//, "") || "molo",
  user: decodeURIComponent(dbUrl.username),
  password: alchemy.secret(decodeURIComponent(dbUrl.password)),
};

/**
 * Each Hyperdrive pool may hold this many connections to Postgres. PlanetScale
 * PS-5 allows 30, three of them reserved for the superuser. Two pools of 20
 * (the default) could take every slot, and Alchemy re-sends the config on
 * each deploy, which opens a new pool while the old one idles for about ten
 * minutes (alchemy-run/alchemy#1807). Five each is 10 in normal running and 20
 * during a deploy, which leaves room for the audio worker, migrations and the
 * CLI. On 2026-09-27 the review page's burst of private audio exhausted the
 * slots: learners were fine, the worker and the CLI could not connect.
 * Alchemy 0.94 has no prop for it; the field passes straight to the API.
 */
const POOL_LIMIT = { origin_connection_limit: 5 } as Record<string, unknown>;

const hyperdrive = await Hyperdrive("db", {
  name: `molo-db-${stageName}`,
  origin,
  caching: { disabled: true },
  adopt: true,
  ...POOL_LIMIT,
});

/**
 * The read path. 60 seconds is the same number the Worker holds the content
 * version for (docs/CACHING.md section 3), so the two layers go stale
 * together rather than one after the other, and an editor's publish still
 * reaches a learner within a minute. 15 seconds of stale_while_revalidate
 * keeps the refresh off the request path.
 */
const hyperdriveCached = await Hyperdrive("db-cached", {
  name: `molo-db-cached-${stageName}`,
  origin,
  caching: { max_age: 60, stale_while_revalidate: 15 },
  adopt: true,
  ...POOL_LIMIT,
});

// ---- api worker ------------------------------------------------------------

/** Secret bindings for whichever of these the environment provides. */
function optionalSecrets(
  names: readonly string[],
): Record<string, ReturnType<typeof alchemy.secret>> {
  const out: Record<string, ReturnType<typeof alchemy.secret>> = {};
  for (const name of names) {
    const value = process.env[name];
    if (value) out[name] = alchemy.secret(value);
  }
  return out;
}

// Namespace ids are the identity of a limiter and must match wrangler.jsonc, so
// a counter is not reset by a deploy. `limit()` is called with a key in
// apps/api/src/ratelimit.ts.
const authLimiter = RateLimit({ namespace_id: 1001, simple: { limit: 20, period: 60 } });
const webhookLimiter = RateLimit({ namespace_id: 1002, simple: { limit: 120, period: 60 } });
// "Report this exercise": per account, not per address. Five a minute is a
// burst cap on filling an editor's queue, not a daily quota.
const reportLimiter = RateLimit({ namespace_id: 1003, simple: { limit: 5, period: 60 } });

await Worker("api", {
  name: `molo-api-${stageName}`,
  entrypoint: new URL("../apps/api/src/index.ts", import.meta.url).pathname,
  // The plugin sees the actual Alchemy bundle. Its maps remain private Worker
  // metadata; deleting them here would prevent Alchemy from assembling the upload.
  ...(apiSentry
    ? { bundle: { sourcemap: "external" as const, plugins: sentryWorkerPlugins(apiSentry) } }
    : {}),
  compatibilityDate: "2026-09-01",
  compatibilityFlags: ["nodejs_compat"],
  // One origin, the hostname the bindings below already promise
  // (BETTER_AUTH_URL, the audio base URL). Before this the Worker only
  // answered on workers.dev while telling Better Auth it lived on
  // api.hellomolo.com, so sign-in cookies could never have matched. A Workers
  // custom domain creates the DNS record and certificate itself, and the
  // workers.dev URL stays off so there is no second origin to bind to.
  url: false,
  domains: [{ domainName: apiHost, adopt: true }],
  adopt: true,
  observability: { enabled: true },
  // Run the Worker next to the database instead of next to the learner. A
  // learner request makes two to four database round-trips (session, then
  // the content and progress reads) and the database is one place, London
  // (PlanetScale `aws-eu-west-2`, docs/ARCHITECTURE.md). From Cape Town each
  // of those hops was ~500 ms edge-to-origin in the 2026-09 speed report;
  // placed here they are intra-region and the learner pays the long hop once.
  // A region is used rather than `mode: "smart"` because smart placement
  // learns from traffic and this Worker has almost none yet. The web Worker
  // keeps edge placement: it serves assets and proxies nothing (MOL-25).
  placement: { region: "aws:eu-west-2" },
  bindings: {
    // Rate limiters. These existed only in wrangler.jsonc, which is the local
    // development configuration, so a deployed Worker had none of them bound
    // and `ratelimit.ts` fails open when a binding is absent: sign-in, the
    // RevenueCat webhook and learner reports were all unlimited in production.
    // The numbers match wrangler.jsonc; the period may only be 10 or 60.
    AUTH_LIMITER: authLimiter,
    WEBHOOK_LIMITER: webhookLimiter,
    REPORT_LIMITER: reportLimiter,
    HYPERDRIVE: hyperdrive,
    HYPERDRIVE_CACHED: hyperdriveCached,
    R2_PUBLIC: publicBucket,
    R2_PRIVATE: privateBucket,
    AUDIO_QUEUE: audioQueue,
    INGEST_QUEUE: ingestQueue,
    FORVO_QUEUE: forvoQueue,
    ENVIRONMENT: environment,
    SENTRY_RELEASE: release,
    BETTER_AUTH_URL: `https://${apiHost}`,
    WEB_ORIGIN: `https://${webHost}`,
    PUBLIC_AUDIO_BASE_URL: `https://${apiHost}/audio`,
    BETTER_AUTH_SECRET: alchemy.secret(need("BETTER_AUTH_SECRET")),
    AUDIO_SIGNING_SECRET: alchemy.secret(need("AUDIO_SIGNING_SECRET")),
    ...(process.env["SENTRY_DSN"] ? { SENTRY_DSN: alchemy.secret(process.env["SENTRY_DSN"]) } : {}),
    ...(process.env["RESEND_API_KEY"]
      ? { RESEND_API_KEY: alchemy.secret(process.env["RESEND_API_KEY"]) }
      : {}),
    // Weekly content report (Monday 08:00 UTC cron); without it the report is only logged.
    ...(process.env["SLACK_WEBHOOK_URL"]
      ? { SLACK_WEBHOOK_URL: alchemy.secret(process.env["SLACK_WEBHOOK_URL"]) }
      : {}),
    ...(environment === "prod"
      ? optionalSecrets(["SLACK_SIGNUPS_WEBHOOK_URL", "SLACK_SUBSCRIPTIONS_WEBHOOK_URL"])
      : {}),
    // The rest of apps/api/src/env.ts, passed through when set. Each one is
    // optional in the Worker too: without RESEND_FROM email goes out from the
    // placeholder address, without the webhook secret RevenueCat is refused,
    // without the OAuth pairs social sign-in is simply not offered.
    ...optionalSecrets([
      "EXPO_ACCESS_TOKEN",
      "REVENUECAT_WEBHOOK_SECRET",
      "APPLE_CLIENT_ID",
      "APPLE_CLIENT_SECRET",
      // The bundle id's secret: native Apple token exchange and revocation on deletion.
      "APPLE_APP_CLIENT_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      // Starts the GitHub audio worker when recordings wait (audio-worker-kick.ts).
      "GH_DISPATCH_TOKEN",
    ]),
    ...(process.env["RESEND_FROM"] ? { RESEND_FROM: process.env["RESEND_FROM"] } : {}),
    ...(process.env["APPLE_APP_BUNDLE_IDENTIFIER"]
      ? { APPLE_APP_BUNDLE_IDENTIFIER: process.env["APPLE_APP_BUNDLE_IDENTIFIER"] }
      : {}),
  },
  // Same schedules as apps/api/wrangler.jsonc: nightly age-step cleanup, leagues
  // and reminders, Monday morning content report. Without this the deployed Worker has no cron.
  // Every five minutes: start the audio worker when recordings wait.
  // One trigger (apps/api/src/scheduled.ts, CRON): the account's plan allows
  // five across every Worker and other projects use three. The tick's time
  // picks the job: 17:00 UTC nightly, Monday 08:00 UTC the report, every tick
  // the audio-worker check.
  crons: ["*/5 * * * *"],
  // Worker-side consumers only; audio-process is pulled by `molo audio worker`
  // (see the queues section). Adding it here would make it a push queue and
  // `molo cf queues` refuses to proceed while a Worker consumer is attached.
  eventSources: [
    { queue: ingestQueue, settings: { batchSize: 1, maxRetries: 3 } },
    { queue: forvoQueue, settings: { batchSize: 5, maxRetries: 3, maxWaitTimeMs: 30_000 } },
  ],
});

console.log(`api: https://${apiHost}`);

// ---- web -------------------------------------------------------------------
// One stage is one run: Alchemy destroys whatever a run does not declare, so
// the API and the web app cannot be deployed by separate invocations of this
// script against the same stage. The web Worker is TanStack Start's own
// server entry plus the client bundle as static assets; `vite build` in
// apps/web produces both, and VITE_* values are inlined at that moment, which
// is why the API host is a build-time env here and not a binding.
if (!destroy) {
  // Part of the existing live deploy: read this stage's published data and
  // bundle the archive as a static asset. No external storage write here.
  execFileSync(
    "bun",
    [
      "packages/cli/src/main.ts",
      "content",
      "export",
      "--published",
      "--out",
      "apps/web/public/lexicon-data",
      "--env",
      stage,
      "--live",
    ],
    { stdio: "inherit" },
  );
}
await TanStackStart("web", {
  name: `molo-web-${stageName}`,
  cwd: "apps/web",
  build: {
    command: "bun run build",
    env: {
      VITE_API_URL: `https://${apiHost}`,
      VITE_SENTRY_RELEASE: release,
      SENTRY_RELEASE: release,
      ...(process.env["VITE_SENTRY_DSN"]
        ? { VITE_SENTRY_DSN: process.env["VITE_SENTRY_DSN"] }
        : {}),
    },
  },
  compatibilityDate: "2026-09-01",
  compatibilityFlags: ["nodejs_compat"],
  url: false,
  // www. is bound too, and apps/web/src/start.ts answers it with a permanent
  // redirect: the API's CORS and Better Auth's cookies know one origin.
  domains: [
    { domainName: webHost, adopt: true },
    { domainName: `www.${webHost}`, adopt: true },
  ],
  adopt: true,
  observability: { enabled: true },
});

console.log(`web: https://${webHost}`);

await app.finalize();
