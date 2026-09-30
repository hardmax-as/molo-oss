/**
 * Leagues against Postgres: XP seats a learner in this week's bronze
 * league, standings follow xp_events, cohorts split at the size limit,
 * finalisation writes outcomes once and decides next week's tier, and
 * reminder candidates are exactly the opted-in learners with a streak at
 * risk.
 */

import { schema } from "@molo/db";
import {
  awardXp,
  currentLeague,
  finalizeDueLeagues,
  joinLeague,
  leagueHistory,
  reminderCandidates,
  touchStreak,
} from "@molo/gamification";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS } from "../src/fixtures.ts";
import { harness, type Harness } from "./helpers.ts";

let h: Harness;
const learner = FIXTURE_USERS.learner.id;
const other = FIXTURE_USERS.editorA.id;
const third = FIXTURE_USERS.editorB.id;
const NOW = new Date("2026-09-04T10:00:00Z"); // a Friday; week starts 2026-08-31

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => {
  await h?.close();
});

describe("leagues", () => {
  it("first XP of the week seats the learner in bronze; standings follow xp_events", async () => {
    await awardXp(h.db, learner, 10, "lesson");
    await awardXp(h.db, other, 30, "lesson");
    const mine = await currentLeague(h.db, learner);
    expect(mine.league?.tier).toBe("bronze");
    expect(mine.standings.map((s) => [s.userId, s.xp, s.rank])).toEqual([
      [other, 30, 1],
      [learner, 10, 2],
    ]);
    expect(mine.me).toEqual({ rank: 2, xp: 10, zone: "promote" });
    // Idempotent: a second award does not create a second membership.
    await awardXp(h.db, learner, 5, "review");
    const members = await h.db
      .select()
      .from(schema.leagueMembers)
      .where(eq(schema.leagueMembers.userId, learner));
    expect(members).toHaveLength(1);
  });

  it("a full cohort opens a second one", async () => {
    const small = { size: 2, promote: 1, demote: 1 };
    const a = await joinLeague(h.db, learner, NOW, small);
    const b = await joinLeague(h.db, other, NOW, small);
    const c = await joinLeague(h.db, third, NOW, small);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    const leagues = await h.db.select().from(schema.leagues);
    expect(leagues.map((l) => l.cohort).sort()).toEqual([1, 2]);
  });

  it("finalises a past week once and the outcome decides the next tier", async () => {
    const lastWeek = new Date("2026-08-26T10:00:00Z");
    const rules = { size: 20, promote: 1, demote: 1 };
    await joinLeague(h.db, learner, lastWeek, rules);
    await joinLeague(h.db, other, lastWeek, rules);
    // XP inside last week's window.
    await h.db.insert(schema.xpEvents).values([
      {
        userId: learner,
        amount: 50,
        reason: "lesson",
        createdAt: new Date("2026-08-27T09:00:00Z"),
      },
      { userId: other, amount: 5, reason: "lesson", createdAt: new Date("2026-08-27T09:00:00Z") },
    ]);
    expect(await finalizeDueLeagues(h.db, NOW, rules)).toBe(1);
    expect(await finalizeDueLeagues(h.db, NOW, rules)).toBe(0);
    const hist = await leagueHistory(h.db, learner);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({
      weekStart: "2026-08-24",
      tier: "bronze",
      rank: 1,
      xp: 50,
      outcome: "promoted",
    });
    expect((await leagueHistory(h.db, other))[0]?.outcome).toBe("stayed"); // bronze never demotes
    // This week: the promoted learner lands in silver.
    await joinLeague(h.db, learner, NOW, rules);
    const now = await currentLeague(h.db, learner, NOW, rules);
    expect(now.league?.tier).toBe("silver");
    expect(now.league?.weekStart).toBe("2026-08-31");
  });
});

describe("reminders", () => {
  it("lists opted-in learners with a streak who have not studied today", async () => {
    await touchStreak(h.db, learner, "2026-09-03");
    await touchStreak(h.db, other, "2026-09-04");
    await h.db
      .insert(schema.userPrefs)
      .values([
        { userId: learner, reminderOptIn: true },
        { userId: other, reminderOptIn: true },
        { userId: third, reminderOptIn: true },
      ])
      .onConflictDoNothing();
    const rows = await reminderCandidates(h.db, "2026-09-04");
    expect(rows.map((r) => r.userId)).toEqual([learner]); // other studied today, third has no streak
    expect(rows[0]).toMatchObject({ streak: 1, sourceLang: "en" });
  });
});
