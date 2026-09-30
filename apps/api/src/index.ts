import { RepoError } from "@molo/db";
import * as Sentry from "@sentry/cloudflare";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import { requireAgeConfirmed } from "./age-step.ts";
import { handleAuthRequest } from "./auth.ts";
import { noStoreByDefault } from "./content-cache.ts";
import { dbMiddleware } from "./db.ts";
import type { AppEnv, Bindings } from "./env.ts";
import { sessionMiddleware } from "./middleware.ts";
import { refusePreviewWrites } from "./preview-guard.ts";
import { queue } from "./queues.ts";
import { rateLimit } from "./ratelimit.ts";
import { accountRoutes } from "./routes/account.ts";
import { ageRoutes } from "./routes/age.ts";
import { appleRoutes } from "./routes/apple.ts";
import { audioRoutes } from "./routes/audio.ts";
import { courseRoutes } from "./routes/courses.ts";
import { curriculumRoutes } from "./routes/curriculum.ts";
import { editorPreviewRoutes } from "./routes/editor-preview.ts";
import { editorRoutes } from "./routes/editor.ts";
import { healthRoutes } from "./routes/health.ts";
import { leagueRoutes } from "./routes/leagues.ts";
import { learnerRoutes } from "./routes/learner.ts";
import { meRoutes } from "./routes/me.ts";
import { sentenceRoutes } from "./routes/sentences.ts";
import { tutorRoutes } from "./routes/tutor.ts";
import { webPurchaseRoutes } from "./routes/web-purchases.ts";
import { webhookRoutes } from "./routes/webhooks.ts";
import { scheduled } from "./scheduled.ts";

const REPO_STATUS: Record<RepoError["code"], number> = {
  forbidden: 403,
  not_found: 404,
  invalid: 400,
  transition: 409,
  consent_missing: 409,
  conflict: 409,
};

const app = new Hono<AppEnv>()
  // First, so that everything downstream is `private, no-store` unless it
  // said otherwise. Forgetting therefore means "not cached", never "cached
  // wrongly" (docs/CACHING.md section 3).
  .use("*", noStoreByDefault)
  .use("*", async (c, next) => {
    const handler = cors({
      origin: c.env.WEB_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Molo-Preview"],
    });
    return handler(c, next);
  })
  .use("*", dbMiddleware)
  // Better Auth owns everything under /api/auth; it needs the db but not the session.
  .use("/api/auth/*", rateLimit("AUTH_LIMITER"))
  .use("/webhooks/*", rateLimit("WEBHOOK_LIMITER"))
  .on(["GET", "POST"], "/api/auth/*", handleAuthRequest)
  .use("*", sessionMiddleware)
  // A one-tap Apple/Google account reaches nothing but the age step until it is confirmed.
  .use("*", requireAgeConfirmed)
  .use("*", refusePreviewWrites)
  .route("/", healthRoutes)
  // Before every router mounted at "/": me, leagues and web-purchases each
  // `.use("*", requireUser)`, which Hono registers as "/*", so anything mounted
  // after them needs a session. Published audio must not: the native players
  // on iOS and Android fetch it without the app's cookie, and a 401 there is
  // silence, not an error anyone sees (2026-09-27, 1.0.1 on a real iPhone).
  .route("/audio", audioRoutes)
  .route("/", webhookRoutes)
  .route("/", courseRoutes)
  .route("/", learnerRoutes)
  .route("/", ageRoutes)
  .route("/", appleRoutes)
  .route("/", accountRoutes)
  .route("/", meRoutes)
  .route("/", webPurchaseRoutes)
  .route("/", leagueRoutes)
  .route("/edit", editorRoutes)
  .route("/edit/preview", editorPreviewRoutes)
  .route("/edit", curriculumRoutes)
  .route("/edit", sentenceRoutes)
  .route("/edit", tutorRoutes)
  .notFound((c) =>
    c.json(
      { error: { code: "not_found", message: `no route for ${c.req.method} ${c.req.path}` } },
      404,
    ),
  )
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: { code: "http", message: err.message } }, err.status);
    }
    if (err instanceof RepoError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details } },
        REPO_STATUS[err.code] as 400 | 403 | 404 | 409,
      );
    }
    console.error(err);
    return c.json(
      {
        error: {
          code: "internal",
          message: c.env.ENVIRONMENT === "prod" ? "internal error" : String(err),
        },
      },
      500,
    );
  });

export type AppType = typeof app;

export default Sentry.withSentry<Bindings>(
  (env) =>
    env.SENTRY_DSN
      ? {
          dsn: env.SENTRY_DSN,
          environment: env.ENVIRONMENT,
          release: env.SENTRY_RELEASE,
          tracesSampleRate: env.ENVIRONMENT === "prod" ? 0.1 : 1,
        }
      : undefined,
  { fetch: app.fetch, queue, scheduled },
);
