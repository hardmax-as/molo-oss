import type { Actor, AudioProcessMessage, SourceLang } from "@molo/core";
import type { Db } from "@molo/db";

/**
 * Worker bindings and vars (apps/api/wrangler.jsonc). Declared by hand so
 * the code states what it needs; `wrangler types` output is only a check.
 */
export interface Bindings {
  /**
   * The database, with Hyperdrive's query cache **off**. Everything goes
   * through this one: auth, sessions, roles, learner state, every write.
   * Hyperdrive's cache is TTL-only and never invalidates on a write, so a
   * cached session or a cached XP total would be wrong for up to a minute.
   */
  HYPERDRIVE: Hyperdrive;
  /**
   * The same database with the query cache on for 60 seconds, for published
   * content reads and nothing else (docs/CACHING.md section 2.5). Optional
   * because a deployment without it degrades to `HYPERDRIVE`, which is
   * correct and merely slower.
   */
  HYPERDRIVE_CACHED?: Hyperdrive;
  R2_PUBLIC: R2Bucket;
  R2_PRIVATE: R2Bucket;
  AUDIO_QUEUE: Queue<AudioProcessMessage>;
  INGEST_QUEUE: Queue<unknown>;
  FORVO_QUEUE: Queue<unknown>;

  ENVIRONMENT: "local" | "preview" | "prod";
  /** The deployed git SHA, shared with the web build. Not a secret. */
  SENTRY_RELEASE?: string;
  BETTER_AUTH_URL: string;
  WEB_ORIGIN: string;
  PUBLIC_AUDIO_BASE_URL: string;

  // secrets (.dev.vars locally, `wrangler secret` / Alchemy elsewhere)
  BETTER_AUTH_SECRET: string;
  AUDIO_SIGNING_SECRET: string;
  SENTRY_DSN?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  /** Slack incoming webhook for the weekly content report; absent means the cron only logs it. */
  SLACK_WEBHOOK_URL?: string;
  /** Operational notifications; production only, absent means log only. */
  SLACK_SIGNUPS_WEBHOOK_URL?: string;
  SLACK_SUBSCRIPTIONS_WEBHOOK_URL?: string;
  /**
   * Fine-grained GitHub token with Actions: write on the repository only. The
   * five-minute cron uses it to start the audio worker when recordings wait.
   */
  GH_DISPATCH_TOKEN?: string;
  /** Expo push access token. Absent means the push sender is a dry run (a log line), like Resend. */
  EXPO_ACCESS_TOKEN?: string;
  /** Editor LLM assist (ai_draft glosses). Absent locally means the endpoint is inert. */
  ANTHROPIC_API_KEY?: string;
  /** Shared secret sent by RevenueCat in the Authorization header; absent means the webhook refuses everything. */
  REVENUECAT_WEBHOOK_SECRET?: string;
  /** Social sign-in; a provider is offered only when both values exist. */
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  /** iOS bundle id for native Sign in with Apple (id-token flow). */
  APPLE_APP_BUNDLE_IDENTIFIER?: string;
  /**
   * Client-secret JWT signed for the bundle id (`sub` = APPLE_APP_BUNDLE_IDENTIFIER).
   * Exchanges the native sheet's authorization code for a refresh token and
   * revokes it on account deletion; absent means native tokens are not kept.
   */
  APPLE_APP_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Workers rate limiting bindings (wrangler `ratelimits`); optional so local runs without them still work. */
  AUTH_LIMITER?: RateLimit;
  WEBHOOK_LIMITER?: RateLimit;
  /** Per-account cap on "report this exercise" so one learner cannot fill the editors' queue. */
  REPORT_LIMITER?: RateLimit;
}

export interface Variables {
  /** Tasks registered before response completion; dbMiddleware closes after they settle. */
  backgroundTasks?: Promise<void>[];
  db: Db;
  /** Null when unauthenticated. Learners are actors with role learner only. */
  actor: Actor | null;
  /** The session's user signed up with Apple or Google and has not yet confirmed their age. */
  ageRequired: boolean;
  sourceLang: SourceLang;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };

export function isProd(env: Bindings): boolean {
  return env.ENVIRONMENT === "prod";
}
