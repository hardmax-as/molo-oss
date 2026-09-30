/**
 * The three rules the knobs panel lives or dies by: an override applies, a
 * reset clears it, and an absent override falls back to the shipped
 * constant. Plus the one promise the panel makes out loud — an override
 * changes what a screen shows and nothing else.
 */

import { RUN_RULES, WORD_MILESTONES, XP, XP_LEVEL_DIVISOR, levelForXp } from "@molo/core";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TUNING,
  HEART_DEFAULTS,
  KNOBS,
  NO_FAKE_STATE,
  NO_OVERRIDES,
  applyToHearts,
  applyToProgress,
  isOverriding,
  knobsIn,
  overrideCount,
  parseKnobState,
  resolveTuning,
  serialiseKnobState,
  xpJustBelowNextLevel,
  type HeartsLike,
  type KnobState,
  type ProgressLike,
} from "./knobs.ts";

const state = (overrides: KnobState["overrides"], fake = NO_FAKE_STATE): KnobState => ({
  overrides,
  fake,
});

const progress: ProgressLike = {
  xpTotal: 200,
  level: 2,
  xpToday: 30,
  dailyGoalXp: 50,
  hearts: { hearts: 3, max: 5, unlimited: false, nextRegenAt: null, practiceLeft: 5 },
  streak: { current: 4, freezeAvailable: true },
};

describe("resolveTuning", () => {
  it("falls back to the shipped constant for every knob that is not set", () => {
    const t = resolveTuning(NO_OVERRIDES);
    expect(t.xp.correct).toBe(XP.correct);
    expect(t.xp.perfectLessonBonus).toBe(XP.perfectLessonBonus);
    expect(t.xp.skillChest).toBe(XP.skillChest);
    expect(t.levelDivisor).toBe(XP_LEVEL_DIVISOR);
    expect(t.hearts.max).toBe(HEART_DEFAULTS.max);
    expect(t.hearts.regenMs).toBe(HEART_DEFAULTS.regenMinutes * 60_000);
    expect(t.run).toEqual(RUN_RULES);
    expect(t.milestones).toEqual([...WORD_MILESTONES]);
    expect(t).toEqual(DEFAULT_TUNING);
  });

  it("applies an override, and only that one", () => {
    const t = resolveTuning(state({ "xp.correct": 500 }));
    expect(t.xp.correct).toBe(500);
    expect(t.xp.perfectLessonBonus).toBe(XP.perfectLessonBonus);
    expect(t.milestones).toEqual([...WORD_MILESTONES]);
  });

  it("a cleared record is a reset: every value falls back again", () => {
    const overridden = resolveTuning(state({ "xp.correct": 500, "hearts.max": 1 }));
    expect(overridden.xp.correct).toBe(500);
    // Reset is not a separate path — nothing stored means nothing overridden.
    expect(resolveTuning(parseKnobState(null))).toEqual(DEFAULT_TUNING);
    expect(resolveTuning(NO_OVERRIDES)).toEqual(DEFAULT_TUNING);
  });

  it("moves the milestones as a set", () => {
    const t = resolveTuning(state({ "milestone.0": 1, "milestone.1": 2 }));
    expect(t.milestones.slice(0, 2)).toEqual([1, 2]);
    expect(t.milestones.slice(2)).toEqual([...WORD_MILESTONES].slice(2));
  });
});

describe("parseKnobState", () => {
  it("survives a missing, empty or unparseable record", () => {
    expect(parseKnobState(null)).toEqual(NO_OVERRIDES);
    expect(parseKnobState("")).toEqual(NO_OVERRIDES);
    expect(parseKnobState("{oh no")).toEqual(NO_OVERRIDES);
    expect(parseKnobState("[]")).toEqual({ overrides: {}, fake: NO_FAKE_STATE });
  });

  it("drops a knob it does not know, a value of the wrong type, and one out of range", () => {
    const parsed = parseKnobState(
      JSON.stringify({
        overrides: {
          "xp.correct": 42,
          "xp.nonsense": 1,
          "hearts.max": "five",
          "run.hotAt": 10_000,
        },
      }),
    );
    expect(parsed.overrides).toEqual({ "xp.correct": 42 });
  });

  it("round-trips what it accepted", () => {
    const original = state({ "xp.correct": 42 }, { ...NO_FAKE_STATE, streakDays: 365 });
    expect(parseKnobState(serialiseKnobState(original))).toEqual(original);
  });

  it("keeps a fabricated state only when it is a sane number or a slug", () => {
    const parsed = parseKnobState(
      JSON.stringify({
        fake: { streakDays: 12.7, hearts: -1, xpTotal: "lots", finishedUnitSlug: "" },
      }),
    );
    expect(parsed.fake).toEqual({ ...NO_FAKE_STATE, streakDays: 12 });
  });
});

describe("isOverriding", () => {
  it("is false for nothing, and true for a knob or a fabricated state alone", () => {
    expect(isOverriding(NO_OVERRIDES)).toBe(false);
    expect(isOverriding(state({ "xp.correct": 1 }))).toBe(true);
    expect(isOverriding(state({}, { ...NO_FAKE_STATE, hearts: 0 }))).toBe(true);
    expect(overrideCount(state({ "xp.correct": 1 }, { ...NO_FAKE_STATE, hearts: 0 }))).toBe(2);
  });
});

describe("applying the overrides to what a screen shows", () => {
  it("changes nothing at all when nothing is overridden", () => {
    expect(applyToProgress(progress, DEFAULT_TUNING, NO_FAKE_STATE)).toEqual({
      ...progress,
      // The level is recomputed from the same curve, so it lands where it was.
      level: levelForXp(progress.xpTotal),
    });
  });

  it("recomputes the level from the overridden curve", () => {
    const tuning = resolveTuning(state({ "level.divisor": 10 }));
    const shown = applyToProgress(progress, tuning, NO_FAKE_STATE);
    // 200 XP is level 2 at the shipped divisor and level 4 at a tenth of it.
    expect(levelForXp(200)).toBe(2);
    expect(shown.level).toBe(4);
    expect(shown.xpTotal).toBe(200);
  });

  it("shows a fabricated streak and a fabricated total without touching the rest", () => {
    const shown = applyToProgress(progress, DEFAULT_TUNING, {
      ...NO_FAKE_STATE,
      streakDays: 365,
      xpTotal: 5_000,
    });
    expect(shown.streak.current).toBe(365);
    expect(shown.xpTotal).toBe(5_000);
    expect(shown.level).toBe(levelForXp(5_000));
    expect(shown.xpToday).toBe(progress.xpToday);
  });

  it("empties the hearts without letting them exceed the overridden maximum", () => {
    const tuning = resolveTuning(state({ "hearts.max": 2 }));
    const empty = applyToHearts(progress.hearts, tuning, { ...NO_FAKE_STATE, hearts: 0 });
    expect(empty).toMatchObject({ hearts: 0, max: 2 });
    // Three hearts do not fit in a maximum of two.
    const clamped = applyToHearts(progress.hearts, tuning, NO_FAKE_STATE);
    expect(clamped.hearts).toBe(2);
    expect(clamped.nextRegenAt).toBeNull();
  });

  it("re-derives the countdown from the overridden regeneration, rather than lying", () => {
    const tuning = resolveTuning(state({ "hearts.regenMinutes": 1 }));
    const now = Date.parse("2026-09-05T12:00:00.000Z");
    const shown = applyToHearts(
      progress.hearts,
      tuning,
      { ...NO_FAKE_STATE, hearts: 1 },
      now,
    ) satisfies HeartsLike;
    expect(shown.nextRegenAt).toBe("2026-09-05T12:01:00.000Z");
  });

  it("takes the freeze away when the streak knob says there is none", () => {
    const tuning = resolveTuning(state({ "streak.freezePerWeek": 0 }));
    expect(applyToProgress(progress, tuning, NO_FAKE_STATE).streak.freezeAvailable).toBe(false);
    // And never invents one the server did not grant.
    const noFreeze: ProgressLike = { ...progress, streak: { current: 4, freezeAvailable: false } };
    expect(applyToProgress(noFreeze, DEFAULT_TUNING, NO_FAKE_STATE).streak.freezeAvailable).toBe(
      false,
    );
  });
});

describe("xpJustBelowNextLevel", () => {
  it("leaves the learner one correct answer short of the next level", () => {
    const xp = xpJustBelowNextLevel(0, DEFAULT_TUNING);
    expect(levelForXp(xp)).toBe(0);
    expect(levelForXp(xp + DEFAULT_TUNING.xp.correct)).toBe(1);
  });

  it("follows an overridden curve and an overridden reward", () => {
    const tuning = resolveTuning(state({ "level.divisor": 10, "xp.correct": 100 }));
    const xp = xpJustBelowNextLevel(500, tuning);
    const before = levelForXp(xp, tuning.levelDivisor);
    expect(levelForXp(xp + tuning.xp.correct, tuning.levelDivisor)).toBeGreaterThan(before);
  });
});

describe("the catalogue itself", () => {
  it("has a unique id per knob, a sane range, and a default inside it", () => {
    const ids = KNOBS.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of KNOBS) {
      expect(k.min, k.id).toBeLessThanOrEqual(k.max);
      expect(k.value, k.id).toBeGreaterThanOrEqual(k.min);
      expect(k.value, k.id).toBeLessThanOrEqual(k.max);
      expect(k.label.length, k.id).toBeGreaterThan(0);
    }
  });

  it("puts every knob in exactly one group, and no group is empty", () => {
    const grouped = ["rewards", "hearts", "streak", "celebration"].flatMap((g) =>
      knobsIn(g as "rewards").map((k) => k.id),
    );
    expect(grouped.sort()).toEqual(KNOBS.map((k) => k.id).sort());
  });
});
