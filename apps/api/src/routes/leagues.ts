/**
 * Weekly leagues for signed-in learners. Membership is created when XP is
 * awarded (see routes/me.ts); reading finalises any league whose week is
 * over so outcomes are never stale.
 *
 * Report and hide (Apple guideline 1.2): a learner can report another
 * member's public name or hide it from their own view. Both only accept a
 * member of the learner's own league this week. A report alerts the
 * operator on Slack with counts only — never the name or an id, since Slack
 * is not one of our data processors.
 */

import { effectValidator } from "@hono/effect-validator";
import { LeagueMemberRequest } from "@molo/core";
import {
  hideLeagueMember,
  reportLeagueMember,
  schema,
  sharesLeague,
  unhideLeagueMember,
} from "@molo/db";
import { currentLeague, leagueHistory, standings, weekStartOf } from "@molo/gamification";
import { and, count, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import type { AppEnv } from "../env.ts";
import { requireUser } from "../middleware.ts";
import { reportRateLimit } from "../ratelimit.ts";
import { postSlack } from "../slack.ts";

function userId(c: { get: (k: "actor") => AppEnv["Variables"]["actor"] }): string {
  const actor = c.get("actor");
  if (!actor) throw new HTTPException(401, { message: "sign in" });
  return actor.id;
}

/** The league both learners are in this week, or a 404 that says nothing about the other id. */
async function assertSameLeague(db: AppEnv["Variables"]["db"], me: string, other: string) {
  if (!(await sharesLeague(db, me, other, weekStartOf(new Date()))))
    throw new HTTPException(404, { message: "not in your league" });
}

export const leagueRoutes = new Hono<AppEnv>()
  .use("*", requireUser)
  .get("/leagues/current", async (c) => c.json(await currentLeague(c.get("db"), userId(c))))
  .get("/leagues/history", async (c) =>
    c.json({ weeks: await leagueHistory(c.get("db"), userId(c)) }),
  )
  .post("/leagues/hide", effectValidator("json", LeagueMemberRequest), async (c) => {
    const me = userId(c);
    const { userId: other } = c.req.valid("json");
    await assertSameLeague(c.get("db"), me, other);
    await hideLeagueMember(c.get("db"), me, other);
    return c.json({ ok: true });
  })
  .delete("/leagues/hide/:userId", async (c) => {
    // No league check: showing a name again only ever narrows what is hidden.
    await unhideLeagueMember(c.get("db"), userId(c), c.req.param("userId"));
    return c.json({ ok: true });
  })
  .post(
    "/leagues/report",
    reportRateLimit,
    effectValidator("json", LeagueMemberRequest),
    async (c) => {
      const db = c.get("db");
      const me = userId(c);
      const { userId: other } = c.req.valid("json");
      await assertSameLeague(db, me, other);
      // The name as the reporter's league shows it, before their own hide applies.
      const [m] = await db
        .select({ leagueId: schema.leagueMembers.leagueId })
        .from(schema.leagueMembers)
        .where(
          and(
            eq(schema.leagueMembers.userId, other),
            eq(schema.leagueMembers.weekStart, weekStartOf(new Date())),
          ),
        );
      const row = m ? (await standings(db, m.leagueId)).rows.find((r) => r.userId === other) : null;
      const [user] = await db
        .select({ name: schema.users.name, displayName: schema.users.displayName })
        .from(schema.users)
        .where(eq(schema.users.id, other));
      const seen = row?.name ?? user?.displayName ?? user?.name ?? "";
      const fresh = await reportLeagueMember(db, me, other, seen);
      if (fresh) {
        const [open] = await db
          .select({ n: count() })
          .from(schema.leagueReports)
          .where(isNull(schema.leagueReports.resolvedAt));
        const alert = postSlack(
          c.env,
          `:triangular_flag_on_post: A league name was reported. Open league reports: ${open?.n ?? 0}. ` +
            "Review within 24 hours (docs/STORE-REVIEW-CHECKLIST.md, 'Moderating league names').",
        ).catch((e: unknown) => console.error("league report alert failed", e));
        try {
          c.executionCtx.waitUntil(alert);
        } catch {
          await alert;
        }
      }
      return c.json({ ok: true });
    },
  );
