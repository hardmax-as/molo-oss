import {
  celebrationBeats,
  celebrationExtras,
  crossedWordMilestone,
  guestCelebrationExtras,
  type CelebrationFacts,
} from "@molo/core/celebration";

/**
 * The mobile half of the beat-selection contract (docs/DESIGN.md "After a
 * lesson"). The rules live in @molo/core so both clients play the same
 * beats in the same order; this asserts the app sees them that way.
 */

const week = (...days: number[]) => Array.from({ length: 7 }, (_, i) => days.includes(i));

const facts = (over: Partial<CelebrationFacts> = {}): CelebrationFacts => ({
  streakExtended: false,
  streakDays: 0,
  streakFrozen: false,
  streakWeek: week(),
  streakTodayIndex: 0,
  wordsLearned: 0,
  wordsLearnedBefore: 0,
  unitCompleted: null,
  ...over,
});

describe("celebration beats", () => {
  it("plays the lesson beat alone when nothing else was earned", () => {
    const beats = celebrationBeats({
      xp: 30,
      correct: 3,
      total: 4,
      ...celebrationExtras(facts({ streakDays: 5, wordsLearned: 12, wordsLearnedBefore: 10 })),
    });
    expect(beats.map((b) => b.kind)).toEqual(["lesson"]);
    expect(beats[0]).toMatchObject({ perfect: false, accuracy: 75 });
  });

  it("plays every earned beat in order", () => {
    const beats = celebrationBeats({
      xp: 80,
      correct: 5,
      total: 5,
      ...celebrationExtras(
        facts({
          streakExtended: true,
          streakDays: 3,
          streakWeek: week(0, 1, 2),
          streakTodayIndex: 2,
          wordsLearned: 26,
          wordsLearnedBefore: 22,
          unitCompleted: { slug: "unit-1", titleKey: "units.unit1.title", flawless: true },
        }),
      ),
    });
    expect(beats.map((b) => b.kind)).toEqual(["lesson", "streak", "milestone", "unit"]);
    expect(beats[1]).toMatchObject({ days: 3, frozen: false, todayIndex: 2 });
    expect(beats[2]).toMatchObject({ threshold: 25, words: 26 });
    expect(beats[3]).toMatchObject({ flawless: true });
  });

  it("says the streak was saved rather than extended after a freeze", () => {
    const beats = celebrationBeats({
      xp: 10,
      correct: 1,
      total: 1,
      ...celebrationExtras(
        facts({ streakExtended: true, streakFrozen: true, streakDays: 8, streakTodayIndex: 4 }),
      ),
    });
    expect(beats[1]).toMatchObject({ kind: "streak", frozen: true });
  });

  it("stays quiet on a second lesson the same day", () => {
    const beats = celebrationBeats({
      xp: 10,
      correct: 1,
      total: 1,
      ...celebrationExtras(facts({ streakExtended: false, streakDays: 4 })),
    });
    expect(beats.map((b) => b.kind)).toEqual(["lesson"]);
  });

  it("gives a guest no beat that needs an account", () => {
    const extras = guestCelebrationExtras({
      unit: { slug: "unit-1", titleKey: "units.unit1.title", lessonCount: 1 },
      lessons: [{ correct: 4, total: 4 }],
    });
    const beats = celebrationBeats({ xp: 60, correct: 4, total: 4, ...extras });
    expect(beats.map((b) => b.kind)).toEqual(["lesson", "unit"]);
    expect(extras.streak).toBeNull();
    expect(extras.words).toBeNull();
  });

  it("crosses each round number exactly once", () => {
    expect(crossedWordMilestone(24, 25)).toBe(25);
    expect(crossedWordMilestone(25, 26)).toBeNull();
    expect(crossedWordMilestone(249, 260)).toBe(250);
  });
});
