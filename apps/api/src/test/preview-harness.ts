import type { Actor } from "@molo/core";
import type { Db } from "@molo/db";
import { Hono } from "hono";

import type { AppEnv, Bindings } from "../env.ts";
import { refusePreviewWrites } from "../preview-guard.ts";
import { editorPreviewRoutes } from "../routes/editor-preview.ts";
import { learnerRoutes } from "../routes/learner.ts";

/** Test-only composition: real read routes, injected database and authenticated actor. */
export function previewTestApp(db: Db, actor: Actor) {
  const app = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("db", db);
      c.set("actor", actor);
      c.set("sourceLang", "en");
      await next();
    })
    .use("*", refusePreviewWrites)
    .route("/edit/preview", editorPreviewRoutes)
    .route("/", learnerRoutes)
    .post("/me/*", (c) => c.json({ reachedWriteHandler: true }));
  const env = {
    ENVIRONMENT: "local",
    PUBLIC_AUDIO_BASE_URL: "http://localhost/audio",
    AUDIO_SIGNING_SECRET: "fixture-preview-signing",
  } as Bindings;
  return { request: (path: string, init?: RequestInit) => app.request(path, init, env) };
}
