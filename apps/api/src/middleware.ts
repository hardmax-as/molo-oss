import { SOURCE_LANGUAGES, type SourceLang } from "@molo/core";
import { actorFor, schema } from "@molo/db";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import { createAuth } from "./auth.ts";
import type { AppEnv } from "./env.ts";

function pickLang(raw: string | null | undefined, fallback: SourceLang): SourceLang {
  return (SOURCE_LANGUAGES as readonly string[]).includes(raw ?? "")
    ? (raw as SourceLang)
    : fallback;
}

/**
 * Resolves the session (if any) into an `Actor` whose roles come from
 * `user_roles`, and the learner's source language from `user_prefs` or the
 * `lang` query parameter. Never throws for anonymous requests.
 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = c.get("db");
  const auth = createAuth(c.env, db);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  let lang: SourceLang = "en";
  c.set("ageRequired", session?.user.agePending === true);
  if (session) {
    c.set("actor", await actorFor(db, session.user.id));
    const [prefs] = await db
      .select({ sourceLang: schema.userPrefs.sourceLang })
      .from(schema.userPrefs)
      .where(eq(schema.userPrefs.userId, session.user.id))
      .limit(1);
    if (prefs) lang = prefs.sourceLang;
  } else {
    c.set("actor", null);
  }
  c.set("sourceLang", pickLang(c.req.query("lang"), lang));
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("actor")) throw new HTTPException(401, { message: "sign in required" });
  await next();
};

/** Editorial routes: role checked here AND again inside the repository (ARCHITECTURE section 7). */
export const requireEditorial: MiddlewareHandler<AppEnv> = async (c, next) => {
  const actor = c.get("actor");
  if (!actor) throw new HTTPException(401, { message: "sign in required" });
  if (!actor.roles.some((r) => r === "editor" || r === "admin")) {
    throw new HTTPException(403, { message: "editor or admin role required" });
  }
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const actor = c.get("actor");
  if (!actor) throw new HTTPException(401, { message: "sign in required" });
  if (!actor.roles.includes("admin"))
    throw new HTTPException(403, { message: "admin role required" });
  await next();
};
