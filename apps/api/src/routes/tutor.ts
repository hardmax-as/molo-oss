/**
 * What a tutor is asked to supply, mounted under /edit (docs/EDITOR-GUIDE.md,
 * "A tutor session"). Editor and admin only, like every /edit route.
 *
 *   - Sentence requests: list, answer (creates a `draft` sentence and its
 *     glosses), set aside, reopen. A request is never content and no learner
 *     route reads the table.
 *   - Culture cards: the `culture_card` exercises with their caveats. Edits go
 *     through `PATCH /edit/exercises/:id` and status through
 *     `/edit/transition`, exactly like any other exercise; there is nothing
 *     here that moves a status.
 *   - Golden forms: the tutor's answers on /edit/goldens, saved per card so a
 *     tutor working alone never depends on one browser. Not content, no
 *     status; `molo morph goldens pull` turns them into the TOML.
 */

import { effectValidator } from "@hono/effect-validator";
import { DismissSentenceRequestBody, FulfilSentenceRequestBody, PutGoldenAnswer } from "@molo/core";
import { goldenAnswersRepo, tutorRepo } from "@molo/db";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../env.ts";
import { requireEditorial } from "../middleware.ts";
import { wasmMorph } from "../morph.ts";

function repoOf(c: Context<AppEnv>) {
  const actor = c.get("actor");
  if (!actor) throw new HTTPException(401, { message: "sign in required" });
  return tutorRepo(c.get("db"), actor, { morph: wasmMorph });
}

function goldensOf(c: Context<AppEnv>) {
  const actor = c.get("actor");
  if (!actor) throw new HTTPException(401, { message: "sign in required" });
  return goldenAnswersRepo(c.get("db"), actor);
}

export const tutorRoutes = new Hono<AppEnv>()
  .use("*", requireEditorial)

  .get("/sentence-requests", async (c) => {
    const requests = await repoOf(c).listRequests({
      courseId: c.req.query("courseId"),
      unitSlug: c.req.query("unit"),
    });
    return c.json({ requests });
  })
  .post(
    "/sentence-requests/:id/fulfil",
    effectValidator("json", FulfilSentenceRequestBody),
    async (c) => {
      const result = await repoOf(c).fulfilRequest(c.req.param("id"), c.req.valid("json"));
      return c.json(result, 201);
    },
  )
  .post(
    "/sentence-requests/:id/dismiss",
    effectValidator("json", DismissSentenceRequestBody),
    async (c) => {
      await repoOf(c).dismissRequest(c.req.param("id"), c.req.valid("json").reason);
      return c.json({ ok: true });
    },
  )
  .post("/sentence-requests/:id/reopen", async (c) => {
    await repoOf(c).reopenRequest(c.req.param("id"));
    return c.json({ ok: true });
  })

  .get("/culture-cards", async (c) => {
    const cards = await repoOf(c).cultureCards(c.req.query("courseId"));
    return c.json({ cards });
  })

  .get("/goldens", async (c) => {
    const answers = await goldensOf(c).list();
    return c.json({ answers });
  })
  .put("/goldens", effectValidator("json", PutGoldenAnswer), async (c) => {
    const answer = await goldensOf(c).put(c.req.valid("json"));
    return c.json({ answer });
  });
