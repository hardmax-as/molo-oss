/**
 * Scheduler and gamification against Postgres: cards only for published
 * lexemes, due ∪ new sessions, review_log appends, streak arithmetic, XP
 * totals derived from the log.
 */

import { schema } from "@molo/db";
import { awardXp, progress, touchStreak } from "@molo/gamification";
import { buildSession, ensureCards, recordReview } from "@molo/scheduler";
import { loadFsrsFromDisk } from "@molo/scheduler/fsrs-node";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { FIXTURE_USERS } from "../src/fixtures.ts";
import {
  completeLexeme,
  editorA,
  editorB,
  editorRepo,
  harness,
  yesMorph,
  type Harness,
} from "./helpers.ts";

let h: Harness;
const learnerId = FIXTURE_USERS.learner.id;
const fsrs = loadFsrsFromDisk();

beforeEach(async () => {
  h ??= await harness();
  await h.reset();
});
afterAll(async () => {
  await h?.close();
});

async function publishedLexeme(lemma: string): Promise<string> {
  const id = await completeLexeme(h.db, { creator: editorA, lemma });
  await editorRepo(h.db, editorA, { morph: yesMorph }).transitionEntity({
    kind: "lexeme",
    id,
    to: "in_review",
  });
  const r = await editorRepo(h.db, editorB, { morph: yesMorph }).transitionEntity({
    kind: "lexeme",
    id,
    to: "published",
  });
  if (!r.ok) throw new Error(r.reason);
  return id;
}

describe("scheduler", () => {
  it("creates cards only for published lexemes and serves them as new", async () => {
    const pub = await publishedLexeme("zz-pub");
    const draft = await editorRepo(h.db, editorA, { morph: yesMorph }).createLexeme({
      lemma: "zz-draft",
      pos: "verb",
      source: "fixture",
      licence: "CC-BY-SA-4.0",
      origin: "human",
    });
    expect(await ensureCards(h.db, learnerId, [pub, draft])).toBe(1);
    expect(await ensureCards(h.db, learnerId, [pub, draft])).toBe(0);
    const s = await buildSession(h.db, learnerId, { newLimit: 10 });
    expect(s.due).toEqual([]);
    expect(s.fresh.map((c) => c.lexemeId)).toEqual([pub]);
  });

  it("records a review: card advances, review_log appends, due cards come before new ones", async () => {
    const a = await publishedLexeme("zz-a");
    const b = await publishedLexeme("zz-b");
    await ensureCards(h.db, learnerId, [a, b]);
    const first = (await buildSession(h.db, learnerId)).fresh[0]!;
    const now = new Date("2026-09-03T10:00:00Z");
    const out = await recordReview(h.db, fsrs, learnerId, first.id, 3, now);
    expect(out).not.toBeNull();
    expect(out!.next.reps).toBe(1);
    const [row] = await h.db
      .select()
      .from(schema.reviewCards)
      .where(eq(schema.reviewCards.id, first.id));
    expect(row?.reps).toBe(1);
    expect(row?.state).not.toBe("new");
    const log = await h.db
      .select()
      .from(schema.reviewLog)
      .where(eq(schema.reviewLog.cardId, first.id));
    expect(log).toHaveLength(1);
    expect(log[0]?.rating).toBe(3);
    // A year later it is due, and due cards lead the session.
    const later = await buildSession(h.db, learnerId, { now: new Date("2027-09-03T10:00:00Z") });
    expect(later.due.map((c) => c.id)).toEqual([first.id]);
    expect(later.fresh.map((c) => c.lexemeId)).toEqual([first.lexemeId === a ? b : a]);
  });

  it("refuses another user's card", async () => {
    const a = await publishedLexeme("zz-a");
    await ensureCards(h.db, learnerId, [a]);
    const card = (await buildSession(h.db, learnerId)).fresh[0]!;
    expect(await recordReview(h.db, fsrs, FIXTURE_USERS.editorA.id, card.id, 3)).toBeNull();
  });
});

describe("gamification", () => {
  it("derives totals from xp_events and never subtracts", async () => {
    await awardXp(h.db, learnerId, 10, "lesson");
    await awardXp(h.db, learnerId, -50, "adjustment");
    await awardXp(h.db, learnerId, 15, "click_drill");
    const p = await progress(h.db, learnerId, new Date().toISOString().slice(0, 10));
    expect(p.xpTotal).toBe(25);
    expect(p.xpToday).toBe(25);
    expect(p.level).toBe(0);
    expect(p.dailyGoalXp).toBe(50);
  });

  it("counts today from the learner's midnight, not from UTC's", async () => {
    // Oslo, half past midnight: the local date is already tomorrow in UTC
    // terms, so a UTC day window would start in the future and show nothing.
    await awardXp(h.db, learnerId, 30, "lesson");
    const now = new Date();
    const local = new Date(now.getTime() + 2 * 3_600_000);
    const tomorrowLocal = local.toISOString().slice(0, 10);
    const osloOffset = -120;

    const withOffset = await progress(h.db, learnerId, tomorrowLocal, osloOffset);
    const withoutOffset = await progress(h.db, learnerId, tomorrowLocal);
    // Only meaningful in the hours where the two dates disagree.
    if (tomorrowLocal !== now.toISOString().slice(0, 10)) {
      expect(withoutOffset.xpToday).toBe(0);
      expect(withOffset.xpToday).toBe(30);
    } else {
      expect(withOffset.xpToday).toBe(30);
    }
  });

  it("a Plus freeze saves one missed day per week; free learners and longer gaps restart", async () => {
    await touchStreak(h.db, learnerId, "2026-09-01", { plus: true });
    await touchStreak(h.db, learnerId, "2026-09-02", { plus: true });
    // 3 September missed: the weekly freeze covers it.
    expect(await touchStreak(h.db, learnerId, "2026-09-04", { plus: true })).toMatchObject({
      current: 3,
      frozen: true,
    });
    // Same week, second gap: no freeze left, so the streak restarts.
    expect(await touchStreak(h.db, learnerId, "2026-09-06", { plus: true })).toMatchObject({
      current: 1,
      frozen: false,
    });
    // Next ISO week (Monday 7 September) tops the freeze up again.
    expect(await touchStreak(h.db, learnerId, "2026-09-08", { plus: true })).toMatchObject({
      current: 2,
      frozen: true,
    });
    // Two missed days are never covered.
    expect(await touchStreak(h.db, learnerId, "2026-09-11", { plus: true })).toMatchObject({
      current: 1,
      frozen: false,
    });
    // A free learner never has a freeze.
    await touchStreak(h.db, FIXTURE_USERS.editorA.id, "2026-09-01");
    expect(await touchStreak(h.db, FIXTURE_USERS.editorA.id, "2026-09-03")).toMatchObject({
      current: 1,
      frozen: false,
    });
    const p = await progress(h.db, learnerId, "2026-09-11");
    expect(p.streak.freezeAvailable).toBe(false); // no plus entitlement row: freezes come from the plus flag only when touching
  });

  it("extends a streak on consecutive days and restarts after a gap", async () => {
    expect(await touchStreak(h.db, learnerId, "2026-09-01")).toMatchObject({
      current: 1,
      longest: 1,
    });
    expect(await touchStreak(h.db, learnerId, "2026-09-01")).toMatchObject({
      current: 1,
      longest: 1,
    });
    expect(await touchStreak(h.db, learnerId, "2026-09-02")).toMatchObject({
      current: 2,
      longest: 2,
    });
    expect(await touchStreak(h.db, learnerId, "2026-09-05")).toMatchObject({
      current: 1,
      longest: 2,
    });
  });
});
