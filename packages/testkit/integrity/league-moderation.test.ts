import {
  hideLeagueMember,
  REPORTS_TO_HOLD_NAME,
  reportLeagueMember,
  schema,
  sharesLeague,
  unhideLeagueMember,
} from "@molo/db";
import { awardXp, currentLeague, weekStartOf } from "@molo/gamification";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS } from "../src/fixtures.ts";
import { harness, type Harness } from "./helpers.ts";

let h: Harness;
const learner = FIXTURE_USERS.learner.id;
const other = FIXTURE_USERS.editorA.id;
const reporters = [FIXTURE_USERS.learner.id, FIXTURE_USERS.editorB.id, FIXTURE_USERS.admin.id];
const week = () => weekStartOf(new Date());
const nameOf = async (viewer: string, target: string) =>
  (await currentLeague(h.db, viewer)).standings.find((r) => r.userId === target);

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
  for (const u of Object.values(FIXTURE_USERS))
    await h.db
      .update(schema.users)
      .set({ name: u.name, displayName: null, leaguesOptOut: false })
      .where(eq(schema.users.id, u.id));
});
afterAll(async () => {
  await h?.close();
});

describe("league report and hide (Apple 1.2)", () => {
  it("only accepts a member of the same league this week", async () => {
    expect(await sharesLeague(h.db, learner, other, week())).toBe(false);
    await awardXp(h.db, learner, 10, "lesson");
    await awardXp(h.db, other, 5, "lesson");
    expect(await sharesLeague(h.db, learner, other, week())).toBe(true);
    expect(await sharesLeague(h.db, learner, learner, week())).toBe(false);
  });

  it("hides a name for the viewer only, keeps ranks, and can show it again", async () => {
    await awardXp(h.db, learner, 10, "lesson");
    await awardXp(h.db, other, 20, "lesson");
    await hideLeagueMember(h.db, learner, other);
    expect(await nameOf(learner, other)).toMatchObject({ name: null, hidden: true, rank: 1 });
    expect(await nameOf(other, other)).toMatchObject({ name: "Fixture", hidden: false });
    await unhideLeagueMember(h.db, learner, other);
    expect(await nameOf(learner, other)).toMatchObject({ name: "Fixture", hidden: false });
  });

  it("a report hides for the reporter, counts once, and enough reports hold the name for everyone", async () => {
    for (const u of [...reporters, other]) await awardXp(h.db, u, 5, "lesson");
    expect(await reportLeagueMember(h.db, learner, other, "Fixture")).toBe(true);
    expect(await reportLeagueMember(h.db, learner, other, "Fixture")).toBe(false);
    expect((await nameOf(learner, other))?.name).toBeNull();
    expect((await nameOf(FIXTURE_USERS.editorB.id, other))?.name).toBe("Fixture");
    for (const r of reporters.slice(1, REPORTS_TO_HOLD_NAME))
      await reportLeagueMember(h.db, r, other, "Fixture");
    // Every viewer here reported, so clear their own hides: what remains is the hold.
    await h.db.delete(schema.leagueHides).where(eq(schema.leagueHides.hiddenUserId, other));
    expect((await nameOf(FIXTURE_USERS.editorB.id, other))?.name).toBeNull();
    await h.db.update(schema.leagueReports).set({ resolvedAt: new Date() });
    expect((await nameOf(FIXTURE_USERS.editorB.id, other))?.name).toBe("Fixture");
  });

  it("holds back a name the filter refuses, including the first-name fallback", async () => {
    await awardXp(h.db, learner, 10, "lesson");
    await awardXp(h.db, other, 5, "lesson");
    await h.db.update(schema.users).set({ name: "Admin Person" }).where(eq(schema.users.id, other));
    expect((await nameOf(learner, other))?.name).toBeNull();
  });

  it("disappears with either account", async () => {
    await awardXp(h.db, learner, 10, "lesson");
    await awardXp(h.db, other, 5, "lesson");
    await reportLeagueMember(h.db, learner, other, "Fixture");
    expect(await h.db.select().from(schema.leagueReports)).toHaveLength(1);
    expect(await h.db.select().from(schema.leagueHides)).toHaveLength(1);
    await h.db.delete(schema.users).where(eq(schema.users.id, other));
    expect(await h.db.select().from(schema.leagueReports)).toHaveLength(0);
    expect(await h.db.select().from(schema.leagueHides)).toHaveLength(0);
  });
});
