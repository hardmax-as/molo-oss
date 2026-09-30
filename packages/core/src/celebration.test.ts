import { describe, expect, it } from "vitest";

import {
  BEAT_ORDER,
  accuracyOf,
  celebrationBeats,
  celebrationExtras,
  crossedWordMilestone,
  guestCelebrationExtras,
  WORD_MILESTONES,
  type CelebrationFacts,
} from "./celebration.ts";

const facts = (over: Partial<CelebrationFacts> = {}): CelebrationFacts => ({
  streakExtended: false,
  streakDays: 0,
  streakFrozen: false,
  streakWeek: [false, false, false, false, false, false, false],
  streakTodayIndex: 0,
  wordsLearned: 0,
  wordsLearnedBefore: 0,
  unitCompleted: null,
  ...over,
});

const week = (...days: number[]) =>
  Array.from({ length: 7 }, (_, i) => days.includes(i)) as readonly boolean[];

describe("crossedWordMilestone", () => {
  it("returns the threshold a lesson crossed", () => {
    expect(crossedWordMilestone(20, 26)).toBe(25);
    expect(crossedWordMilestone(0, 25)).toBe(25);
    expect(crossedWordMilestone(99, 100)).toBe(100);
  });

  it("returns nothing when no threshold sits in the gap", () => {
    expect(crossedWordMilestone(26, 30)).toBeNull();
    expect(crossedWordMilestone(25, 25)).toBeNull();
    expect(crossedWordMilestone(600, 700)).toBeNull();
    // A replayed lesson creates no cards, so before === after.
    expect(crossedWordMilestone(100, 100)).toBeNull();
  });

  it("celebrates the biggest of several crossed at once", () => {
    expect(crossedWordMilestone(20, 120)).toBe(100);
    expect(crossedWordMilestone(0, 1000)).toBe(500);
  });

  it("never crosses a threshold backwards", () => {
    expect(crossedWordMilestone(120, 20)).toBeNull();
  });

  it("only knows the documented thresholds", () => {
    expect([...WORD_MILESTONES]).toEqual([25, 50, 100, 250, 500]);
  });
});

describe("accuracyOf", () => {
  it("rounds to whole percent and never divides by zero", () => {
    expect(accuracyOf(2, 3)).toBe(67);
    expect(accuracyOf(5, 5)).toBe(100);
    expect(accuracyOf(0, 4)).toBe(0);
    expect(accuracyOf(3, 0)).toBe(0);
  });
});

describe("celebrationBeats", () => {
  it("always opens with the lesson beat, even with nothing else earned", () => {
    const beats = celebrationBeats({ xp: 40, correct: 4, total: 5 });
    expect(beats).toEqual([
      { kind: "lesson", xp: 40, correct: 4, total: 5, perfect: false, accuracy: 80 },
    ]);
  });

  it("marks a clean run perfect", () => {
    const [beat] = celebrationBeats({ xp: 60, correct: 4, total: 4 });
    expect(beat).toMatchObject({ kind: "lesson", perfect: true, accuracy: 100 });
  });

  it("clamps a client's counts rather than trusting them", () => {
    const [beat] = celebrationBeats({ xp: -5, correct: 9, total: 3 });
    expect(beat).toMatchObject({ xp: 0, correct: 3, total: 3, perfect: true });
  });

  it("adds the streak beat only when this lesson moved it on", () => {
    const streak = { days: 3, extended: true, frozen: false, week: week(0, 1, 2), todayIndex: 2 };
    expect(celebrationBeats({ xp: 10, correct: 1, total: 1, streak }).map((b) => b.kind)).toEqual([
      "lesson",
      "streak",
    ]);
    expect(
      celebrationBeats({
        xp: 10,
        correct: 1,
        total: 1,
        streak: { ...streak, extended: false },
      }).map((b) => b.kind),
    ).toEqual(["lesson"]);
    // A learner with no streak at all gets no beat.
    expect(
      celebrationBeats({
        xp: 10,
        correct: 1,
        total: 1,
        streak: { ...streak, days: 0 },
      }).map((b) => b.kind),
    ).toEqual(["lesson"]);
  });

  it("carries the week strip and the freeze onto the streak beat", () => {
    const beats = celebrationBeats({
      xp: 10,
      correct: 1,
      total: 1,
      streak: { days: 9, extended: true, frozen: true, week: week(0, 2, 3), todayIndex: 3 },
    });
    expect(beats[1]).toEqual({
      kind: "streak",
      days: 9,
      frozen: true,
      week: week(0, 2, 3),
      todayIndex: 3,
    });
  });

  it("adds the milestone beat only when a threshold was crossed", () => {
    const beats = celebrationBeats({
      xp: 10,
      correct: 1,
      total: 1,
      words: { before: 23, learned: 27 },
    });
    expect(beats[1]).toEqual({ kind: "milestone", threshold: 25, words: 27 });
    expect(
      celebrationBeats({
        xp: 10,
        correct: 1,
        total: 1,
        words: { before: 26, learned: 30 },
      }).map((b) => b.kind),
    ).toEqual(["lesson"]);
  });

  it("adds the unit beat only when the lesson finished the unit", () => {
    const unit = {
      slug: "unit-1",
      titleKey: "units.unit1.title",
      completed: true,
      flawless: false,
    };
    expect(celebrationBeats({ xp: 10, correct: 1, total: 1, unit }).map((b) => b.kind)).toEqual([
      "lesson",
      "unit",
    ]);
    expect(
      celebrationBeats({ xp: 10, correct: 1, total: 1, unit: { ...unit, completed: false } }).map(
        (b) => b.kind,
      ),
    ).toEqual(["lesson"]);
  });

  it("plays everything earned in the documented order", () => {
    const beats = celebrationBeats({
      xp: 80,
      correct: 6,
      total: 6,
      streak: { days: 4, extended: true, frozen: false, week: week(0, 1, 2, 3), todayIndex: 3 },
      words: { before: 48, learned: 54 },
      unit: {
        slug: "unit-1",
        titleKey: "units.unit1.title",
        completed: true,
        flawless: true,
      },
    });
    expect(beats.map((b) => b.kind)).toEqual([...BEAT_ORDER]);
    expect(beats[3]).toEqual({
      kind: "unit",
      slug: "unit-1",
      titleKey: "units.unit1.title",
      flawless: true,
    });
  });

  it("treats absent, null and undefined extras alike", () => {
    const bare = celebrationBeats({ xp: 10, correct: 1, total: 1 });
    const nulled = celebrationBeats({
      xp: 10,
      correct: 1,
      total: 1,
      streak: null,
      words: null,
      unit: null,
    });
    expect(nulled).toEqual(bare);
  });
});

describe("celebrationExtras", () => {
  it("maps the server's facts onto the beat inputs", () => {
    const beats = celebrationBeats({
      xp: 40,
      correct: 4,
      total: 4,
      ...celebrationExtras(
        facts({
          streakExtended: true,
          streakDays: 2,
          streakWeek: week(0, 1),
          streakTodayIndex: 1,
          wordsLearned: 51,
          wordsLearnedBefore: 47,
          unitCompleted: { slug: "unit-1", titleKey: "units.unit1.title", flawless: false },
        }),
      ),
    });
    expect(beats.map((b) => b.kind)).toEqual(["lesson", "streak", "milestone", "unit"]);
  });

  it("earns nothing beyond the lesson from an ordinary day", () => {
    const beats = celebrationBeats({
      xp: 40,
      correct: 4,
      total: 4,
      ...celebrationExtras(facts({ streakDays: 6, wordsLearned: 60, wordsLearnedBefore: 57 })),
    });
    expect(beats.map((b) => b.kind)).toEqual(["lesson"]);
  });
});

describe("guestCelebrationExtras", () => {
  const unit = { slug: "unit-1", titleKey: "units.unit1.title", lessonCount: 2 };

  it("never earns a beat that needs an account", () => {
    const extras = guestCelebrationExtras({ unit, lessons: [{ correct: 3, total: 3 }] });
    expect(extras.streak).toBeNull();
    expect(extras.words).toBeNull();
  });

  it("celebrates a unit the guest finished on the device", () => {
    const lessons = [
      { correct: 3, total: 3 },
      { correct: 2, total: 3 },
    ];
    const beats = celebrationBeats({
      xp: 20,
      correct: 2,
      total: 3,
      ...guestCelebrationExtras({ unit, lessons }),
    });
    expect(beats.map((b) => b.kind)).toEqual(["lesson", "unit"]);
    expect(beats[1]).toMatchObject({ kind: "unit", flawless: false });
  });

  it("awards the higher tier when every local lesson was clean", () => {
    const beats = celebrationBeats({
      xp: 40,
      correct: 3,
      total: 3,
      ...guestCelebrationExtras({
        unit,
        lessons: [
          { correct: 3, total: 3 },
          { correct: 3, total: 3 },
        ],
      }),
    });
    expect(beats[1]).toMatchObject({ kind: "unit", flawless: true });
  });

  it("crowns nothing when the guest is replaying a lesson they already did", () => {
    const beats = celebrationBeats({
      xp: 40,
      correct: 3,
      total: 3,
      ...guestCelebrationExtras({
        unit: { slug: "unit-1", titleKey: "units.unit1.title", lessonCount: 1 },
        lessons: [{ correct: 3, total: 3 }],
        firstTime: false,
      }),
    });
    expect(beats.map((b) => b.kind)).toEqual(["lesson"]);
  });

  it("says nothing while the unit is unfinished", () => {
    const beats = celebrationBeats({
      xp: 40,
      correct: 3,
      total: 3,
      ...guestCelebrationExtras({ unit, lessons: [{ correct: 3, total: 3 }] }),
    });
    expect(beats.map((b) => b.kind)).toEqual(["lesson"]);
  });
});
