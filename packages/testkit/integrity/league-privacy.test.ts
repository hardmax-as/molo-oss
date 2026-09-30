import { getLeagueProfile, schema, setLeagueProfile } from "@molo/db";
import { awardXp, currentLeague, joinLeague, weekStartOf } from "@molo/gamification";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS } from "../src/fixtures.ts";
import { harness, type Harness } from "./helpers.ts";

let h: Harness;
const learner = FIXTURE_USERS.learner.id;
const other = FIXTURE_USERS.editorA.id;
const week = () => weekStartOf(new Date());
beforeEach(async () => {
  h ??= await harness();
  await h.reset();
  await h.db.update(schema.users).set({ displayName: null, leaguesOptOut: false });
});
afterEach(async () => {
  await h.db
    .update(schema.users)
    .set({ name: FIXTURE_USERS.learner.name, displayName: null, leaguesOptOut: false })
    .where(eq(schema.users.id, learner));
});
afterAll(async () => {
  await h?.close();
});

describe("league privacy with Postgres", () => {
  it("replaces surnames at the API data boundary and supports clearing an alias", async () => {
    await h.db
      .update(schema.users)
      .set({ name: "Ada PrivateSurname" })
      .where(eq(schema.users.id, learner));
    await awardXp(h.db, learner, 10, "lesson");
    expect((await currentLeague(h.db, learner)).standings[0]?.name).toBe("Ada");
    await setLeagueProfile(
      h.db,
      learner,
      { displayName: "Starling", leaguesOptOut: false },
      week(),
    );
    expect((await currentLeague(h.db, learner)).standings[0]?.name).toBe("Starling");
    await setLeagueProfile(h.db, learner, { displayName: null, leaguesOptOut: false }, week());
    expect((await getLeagueProfile(h.db, learner)).publicName).toBe("Ada");
  });
  it("removes current membership immediately, preserves XP, and rejoins only after opting back in", async () => {
    await awardXp(h.db, learner, 10, "lesson");
    await awardXp(h.db, other, 5, "lesson");
    await setLeagueProfile(h.db, learner, { displayName: null, leaguesOptOut: true }, week());
    await awardXp(h.db, learner, 20, "review");
    expect((await currentLeague(h.db, learner)).league).toBeNull();
    expect((await currentLeague(h.db, other)).standings.map((row) => row.userId)).toEqual([other]);
    expect(await joinLeague(h.db, learner)).toBeNull();
    const xp = await h.db.select().from(schema.xpEvents).where(eq(schema.xpEvents.userId, learner));
    expect(xp.reduce((total, row) => total + row.amount, 0)).toBe(30);
    await setLeagueProfile(h.db, learner, { displayName: null, leaguesOptOut: false }, week());
    expect((await currentLeague(h.db, learner)).league).toBeNull();
    await awardXp(h.db, learner, 5, "review");
    expect((await currentLeague(h.db, learner)).me?.xp).toBe(35);
  });
  it("serializes simultaneous opt-out and assignment on the user row", async () => {
    await Promise.all([
      joinLeague(h.db, learner),
      setLeagueProfile(h.db, learner, { displayName: null, leaguesOptOut: true }, week()),
      joinLeague(h.db, learner),
    ]);
    expect(
      await h.db
        .select()
        .from(schema.leagueMembers)
        .where(eq(schema.leagueMembers.userId, learner)),
    ).toEqual([]);
    expect((await getLeagueProfile(h.db, learner)).leaguesOptOut).toBe(true);
  });
});
