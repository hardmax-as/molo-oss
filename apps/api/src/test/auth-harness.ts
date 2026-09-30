import type { Db } from "@molo/db";
import { Hono } from "hono";

import { requireAgeConfirmed } from "../age-step.ts";
import { handleAuthRequest } from "../auth.ts";
import type { AppEnv, Bindings } from "../env.ts";
import { sessionMiddleware } from "../middleware.ts";
import { accountRoutes } from "../routes/account.ts";
import { ageRoutes } from "../routes/age.ts";
import { appleRoutes } from "../routes/apple.ts";
import { healthRoutes } from "../routes/health.ts";
import { leagueRoutes } from "../routes/leagues.ts";
import { learnerRoutes } from "../routes/learner.ts";
import { webPurchaseRoutes } from "../routes/web-purchases.ts";

export const AUTH_TEST_ORIGIN = "http://localhost:3300";
export const AUTH_TEST_GOOGLE_CLIENT_ID = "google-client-fixture.apps.googleusercontent.com";

/**
 * Test-only: the real Better Auth configuration (`createAuth`) over an
 * injected database, with Google configured by fixture credentials so the
 * social, link and unlink endpoints exist. Nothing leaves the process except
 * what the caller's own `fetch` stub answers (Google's public keys).
 */
export function authTestApp(db: Db, overrides: Partial<Bindings> = {}) {
  const env = {
    ENVIRONMENT: "local",
    BETTER_AUTH_URL: "http://localhost:8787",
    BETTER_AUTH_SECRET: "integrity-auth-secret-fixture-0123456789",
    WEB_ORIGIN: AUTH_TEST_ORIGIN,
    GOOGLE_CLIENT_ID: AUTH_TEST_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: "google-secret-fixture",
    PUBLIC_AUDIO_BASE_URL: "http://localhost/audio",
    AUDIO_SIGNING_SECRET: "fixture-auth-signing",
    ...overrides,
  } as Bindings;
  const auth = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("db", db);
      await next();
    })
    .on(["GET", "POST"], "/api/auth/*", handleAuthRequest);
  // Real waitUntil work is drained before the test moves on or resets its database.
  async function request(app: Hono<AppEnv>, path: string, init: RequestInit): Promise<Response> {
    const tasks: Promise<unknown>[] = [];
    const response = await app.request(path, init, env, {
      waitUntil: (task) => {
        tasks.push(task);
      },
      passThroughOnException() {},
      props: {},
    });
    await Promise.all(tasks);
    return response;
  }
  // The API's own session and age-step middleware in front of the real routes
  // that load outside the Workers runtime (me.ts and the editor routes import
  // WebAssembly). Anything else lands on a stand-in that says it was reached,
  // which is what the age step decides.
  const api = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("db", db);
      await next();
    })
    .use("*", sessionMiddleware)
    .use("*", requireAgeConfirmed)
    .route("/", healthRoutes)
    .route("/", learnerRoutes)
    .route("/", ageRoutes)
    .route("/", appleRoutes)
    .route("/", webPurchaseRoutes)
    .route("/", leagueRoutes)
    .route("/", accountRoutes)
    .all("*", (c) => c.json({ reachedHandler: true }));
  return {
    /** Every concrete route of the real route tables above (middleware and the stand-in excluded). */
    routes: [
      healthRoutes,
      learnerRoutes,
      ageRoutes,
      appleRoutes,
      webPurchaseRoutes,
      leagueRoutes,
      accountRoutes,
    ].flatMap((r) =>
      r.routes.filter((x) => x.method !== "ALL").map(({ method, path }) => ({ method, path })),
    ),
    /** An API route (not /api/auth), with the same cookie Better Auth set. */
    api: (path: string, init: { body?: unknown; cookie?: string; method?: string } = {}) => {
      const headers = new Headers({ origin: AUTH_TEST_ORIGIN });
      if (init.body !== undefined) headers.set("content-type", "application/json");
      if (init.cookie) headers.set("cookie", init.cookie);
      return request(api, path, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    },
    request: (path: string, init: { body?: unknown; cookie?: string; method?: string } = {}) => {
      const headers = new Headers({ origin: AUTH_TEST_ORIGIN });
      if (init.body !== undefined) headers.set("content-type", "application/json");
      if (init.cookie) headers.set("cookie", init.cookie);
      return request(auth, `${env.BETTER_AUTH_URL}/api/auth${path}`, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    },
  };
}
