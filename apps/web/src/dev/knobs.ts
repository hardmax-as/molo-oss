/**
 * The knobs panel's model: which numbers can be turned, what they resolve
 * to, and what a fabricated learner state does to what the client shows.
 *
 * DEVELOPER-ONLY, and session-local by construction. An override lives in
 * this browser's `localStorage` and nowhere else — never on the server,
 * never in another person's session — and it changes only what the client
 * *displays*. **The server remains the authority on what a learner has
 * actually earned and stored.** Turning XP per lesson up to 500 makes the
 * celebration count to 500; the row the API wrote still says what the API
 * decided. The panel says so, out loud, for the same reason.
 *
 * Pure: no React and no `~` imports, so the unit suite can hold the
 * resolution to its three rules — an override applies, a reset clears it,
 * an absent override falls back to the constant — without a browser. The
 * hooks and the banner live in `knobs.tsx`.
 *
 * Gated the way the rest of the gallery is (`access.ts`): a development
 * build, or an `admin` account. Until `armKnobs(true)` has been called by
 * the `/dev` layout route on a production bundle, every read here returns
 * the shipped constants, so a learner's bundle has no path to an override
 * even if something wrote the key by hand.
 */

import {
  RUN_RULES,
  WORD_MILESTONES,
  XP,
  XP_LEVEL_DIVISOR,
  DEFAULT_DAILY_GOAL_XP,
  levelForXp,
  type RunRules,
} from "@molo/core";

/** Mirrors `HEARTS` in `@molo/gamification`, which the client never imports. */
export const HEART_DEFAULTS = { max: 5, regenMinutes: 240, practicePerHeart: 5 } as const;

/** One Plus freeze per ISO week (`@molo/gamification`, `markActivity`). */
export const STREAK_FREEZE_PER_WEEK = 1;

export const STORAGE_KEY = "molo.dev.knobs";
export const ARMED_KEY = "molo.dev.knobs.armed";

// ---------------------------------------------------------------------------
// What can be turned
// ---------------------------------------------------------------------------

export const KNOB_GROUPS = ["rewards", "hearts", "streak", "celebration"] as const;
export type KnobGroup = (typeof KNOB_GROUPS)[number];

export interface KnobSpec {
  readonly id: string;
  readonly group: KnobGroup;
  /** Developer-only English; see the file header and `strings.ts`. */
  readonly label: string;
  readonly hint: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** The unit shown beside the field, when a bare number would not read. */
  readonly unit?: string;
}

/**
 * Grouped the way somebody thinks about them rather than the way the code
 * is laid out: what a learner earns, what paces them, what keeps them
 * coming back, and what the app makes a fuss about.
 */
export const KNOBS = [
  {
    id: "xp.correct",
    group: "rewards",
    label: "XP per correct answer",
    hint: "Every exercise except the click drill",
    value: XP.correct,
    min: 0,
    max: 500,
    step: 1,
  },
  {
    id: "xp.perfectLessonBonus",
    group: "rewards",
    label: "XP for a flawless lesson",
    hint: "Added on top when every answer was right",
    value: XP.perfectLessonBonus,
    min: 0,
    max: 500,
    step: 1,
  },
  {
    id: "xp.clickDrillCorrect",
    group: "rewards",
    label: "XP per click-drill answer",
    hint: "The pronunciation drill pays more, per step",
    value: XP.clickDrillCorrect,
    min: 0,
    max: 500,
    step: 1,
  },
  {
    id: "xp.speakAttempt",
    group: "rewards",
    label: "XP per speaking attempt",
    hint: "Paid whether or not the attempt was good",
    value: XP.speakAttempt,
    min: 0,
    max: 500,
    step: 1,
  },
  {
    id: "xp.skillChest",
    group: "rewards",
    label: "Chest bonus",
    hint: "Granted once per learner per skill",
    value: XP.skillChest,
    min: 0,
    max: 1_000,
    step: 5,
  },
  {
    id: "level.divisor",
    group: "rewards",
    label: "Level curve divisor",
    hint: "level = floor(sqrt(xp / divisor)); smaller is a faster climb",
    value: XP_LEVEL_DIVISOR,
    min: 1,
    max: 500,
    step: 1,
  },
  {
    id: "goal.dailyXp",
    group: "rewards",
    label: "Daily goal",
    hint: "The ring in the header fills against this",
    value: DEFAULT_DAILY_GOAL_XP,
    min: 10,
    max: 500,
    step: 10,
    unit: "XP",
  },
  {
    id: "hearts.max",
    group: "hearts",
    label: "Hearts",
    hint: "How many wrong answers a lesson survives",
    value: HEART_DEFAULTS.max,
    min: 1,
    max: 20,
    step: 1,
  },
  {
    id: "hearts.regenMinutes",
    group: "hearts",
    label: "One heart back every",
    hint: "Regeneration is derived from the last change, not ticked",
    value: HEART_DEFAULTS.regenMinutes,
    min: 1,
    max: 1_440,
    step: 5,
    unit: "min",
  },
  {
    id: "hearts.practicePerHeart",
    group: "hearts",
    label: "Practice ratings per heart",
    hint: "How much review earns one heart back",
    value: HEART_DEFAULTS.practicePerHeart,
    min: 1,
    max: 50,
    step: 1,
  },
  {
    id: "streak.freezePerWeek",
    group: "streak",
    label: "Streak freezes per week",
    hint: "Plus only; a freeze covers one missed day",
    value: STREAK_FREEZE_PER_WEEK,
    min: 0,
    max: 7,
    step: 1,
  },
  {
    id: "run.minToShow",
    group: "celebration",
    label: "Run counter appears at",
    hint: "Below this a run of right answers is not worth saying",
    value: RUN_RULES.minToShow,
    min: 1,
    max: 30,
    step: 1,
    unit: "in a row",
  },
  {
    id: "run.hotAt",
    group: "celebration",
    label: "Run counter turns hot at",
    hint: "The strip takes the warmer colour and shimmers",
    value: RUN_RULES.hotAt,
    min: 1,
    max: 50,
    step: 1,
    unit: "in a row",
  },
  ...WORD_MILESTONES.map((value, i) => ({
    id: `milestone.${i}`,
    group: "celebration" as const,
    label: `Word milestone ${i + 1}`,
    hint: "Crossing it during a lesson earns the medal beat",
    value,
    min: 1,
    max: 10_000,
    step: 1,
    unit: "words",
  })),
] as const satisfies readonly KnobSpec[];

export type KnobId = (typeof KNOBS)[number]["id"];

const SPEC_BY_ID = new Map<string, KnobSpec>(KNOBS.map((k) => [k.id, k]));

export function knobsIn(group: KnobGroup): readonly KnobSpec[] {
  return KNOBS.filter((k) => k.group === group);
}

// ---------------------------------------------------------------------------
// What is stored
// ---------------------------------------------------------------------------

/** A fabricated client state: what a screen shows, never what the server holds. */
export interface FakeState {
  /** Days the header's flame claims. */
  readonly streakDays: number | null;
  /** Hearts left, so "out of hearts" can be reached without failing a lesson. */
  readonly hearts: number | null;
  /** Total XP, so the next lesson can be made to cross a level. */
  readonly xpTotal: number | null;
  /** A unit the path should draw as finished. */
  readonly finishedUnitSlug: string | null;
}

export const NO_FAKE_STATE: FakeState = {
  streakDays: null,
  hearts: null,
  xpTotal: null,
  finishedUnitSlug: null,
};

export interface KnobState {
  readonly overrides: Readonly<Partial<Record<KnobId, number>>>;
  readonly fake: FakeState;
}

export const NO_OVERRIDES: KnobState = { overrides: {}, fake: NO_FAKE_STATE };

/** True when anything at all is in force, which is what the banner asks. */
export function isOverriding(state: KnobState): boolean {
  return (
    Object.keys(state.overrides).length > 0 ||
    Object.values(state.fake).some((v) => v !== null && v !== undefined)
  );
}

/** How many knobs and fakes are set, for the banner's count. */
export function overrideCount(state: KnobState): number {
  return (
    Object.keys(state.overrides).length +
    Object.values(state.fake).filter((v) => v !== null && v !== undefined).length
  );
}

/**
 * Parses whatever is in storage. Anything unrecognised, out of range or the
 * wrong shape is dropped rather than trusted: a half-written record must
 * degrade to the shipped constants, not to a broken screen.
 */
export function parseKnobState(raw: string | null): KnobState {
  if (!raw) return NO_OVERRIDES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NO_OVERRIDES;
  }
  if (typeof parsed !== "object" || parsed === null) return NO_OVERRIDES;
  const rec = parsed as { overrides?: unknown; fake?: unknown };
  const overrides: Partial<Record<KnobId, number>> = {};
  if (typeof rec.overrides === "object" && rec.overrides !== null) {
    for (const [id, value] of Object.entries(rec.overrides as Record<string, unknown>)) {
      const spec = SPEC_BY_ID.get(id);
      if (!spec || typeof value !== "number" || !Number.isFinite(value)) continue;
      if (value < spec.min || value > spec.max) continue;
      overrides[id as KnobId] = value;
    }
  }
  const fake = { ...NO_FAKE_STATE } as { -readonly [K in keyof FakeState]: FakeState[K] };
  if (typeof rec.fake === "object" && rec.fake !== null) {
    const f = rec.fake as Record<string, unknown>;
    for (const key of ["streakDays", "hearts", "xpTotal"] as const) {
      const v = f[key];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) fake[key] = Math.floor(v);
    }
    if (typeof f["finishedUnitSlug"] === "string" && f["finishedUnitSlug"] !== "") {
      fake.finishedUnitSlug = f["finishedUnitSlug"];
    }
  }
  return { overrides, fake };
}

export function serialiseKnobState(state: KnobState): string {
  return JSON.stringify(state);
}

// ---------------------------------------------------------------------------
// What the numbers resolve to
// ---------------------------------------------------------------------------

export interface Tuning {
  readonly xp: {
    readonly correct: number;
    readonly perfectLessonBonus: number;
    readonly clickDrillCorrect: number;
    readonly speakAttempt: number;
    readonly skillChest: number;
  };
  readonly levelDivisor: number;
  readonly dailyGoalXp: number;
  readonly hearts: {
    readonly max: number;
    readonly regenMs: number;
    readonly practicePerHeart: number;
  };
  readonly streak: { readonly freezePerWeek: number };
  readonly run: RunRules;
  readonly milestones: readonly number[];
}

/** The shipped constants, with nothing overridden. The app's normal answer. */
export const DEFAULT_TUNING: Tuning = resolveTuning(NO_OVERRIDES);

/**
 * An override applies; an absent one falls back to the constant. Resetting
 * is not a separate path — a cleared record has no overrides, so every
 * value falls back, which is what makes the reset button trustworthy.
 */
export function resolveTuning(state: KnobState): Tuning {
  const at = (id: KnobId): number => {
    const override = state.overrides[id];
    if (override !== undefined) return override;
    return SPEC_BY_ID.get(id)?.value ?? 0;
  };
  return {
    xp: {
      correct: at("xp.correct"),
      perfectLessonBonus: at("xp.perfectLessonBonus"),
      clickDrillCorrect: at("xp.clickDrillCorrect"),
      speakAttempt: at("xp.speakAttempt"),
      skillChest: at("xp.skillChest"),
    },
    levelDivisor: at("level.divisor"),
    dailyGoalXp: at("goal.dailyXp"),
    hearts: {
      max: at("hearts.max"),
      regenMs: at("hearts.regenMinutes") * 60_000,
      practicePerHeart: at("hearts.practicePerHeart"),
    },
    streak: { freezePerWeek: at("streak.freezePerWeek") },
    run: { minToShow: at("run.minToShow"), hotAt: at("run.hotAt") },
    milestones: WORD_MILESTONES.map((_, i) => at(`milestone.${i}` as KnobId)),
  };
}

// ---------------------------------------------------------------------------
// What the screens are shown
// ---------------------------------------------------------------------------

/** The parts of the progress payload the panel can move. Structural, so no schema import. */
export interface ProgressLike {
  readonly xpTotal: number;
  readonly level: number;
  readonly xpToday: number;
  readonly dailyGoalXp: number;
  readonly hearts: HeartsLike;
  readonly streak: { readonly current: number; readonly freezeAvailable: boolean };
}

export interface HeartsLike {
  readonly hearts: number;
  readonly max: number;
  readonly unlimited: boolean;
  readonly nextRegenAt: string | null;
  readonly practiceLeft: number;
}

/**
 * What the header and the settings page should show, given the knobs and
 * any fabricated state. The server's own numbers are the input: nothing
 * here is sent anywhere, and the next response from the API arrives
 * untouched and is re-decorated the same way.
 */
export function applyToProgress<T extends ProgressLike>(
  progress: T,
  tuning: Tuning,
  fake: FakeState,
  now = Date.now(),
): T {
  const xpTotal = fake.xpTotal ?? progress.xpTotal;
  const hearts = applyToHearts(progress.hearts, tuning, fake, now);
  return {
    ...progress,
    xpTotal,
    level: levelForXp(xpTotal, tuning.levelDivisor),
    dailyGoalXp: tuning.dailyGoalXp,
    hearts,
    streak: {
      ...progress.streak,
      current: fake.streakDays ?? progress.streak.current,
      freezeAvailable: tuning.streak.freezePerWeek > 0 && progress.streak.freezeAvailable,
    },
  };
}

export function applyToHearts<T extends HeartsLike>(
  state: T,
  tuning: Tuning,
  fake: FakeState,
  now = Date.now(),
): T {
  const max = tuning.hearts.max;
  const hearts = Math.max(0, Math.min(fake.hearts ?? state.hearts, max));
  // Only re-derived when something here actually moved: a shorter
  // regeneration that still showed the server's four-hour countdown would
  // be a lie, but so would replacing an untouched countdown with a fresh
  // one, which would restart it on every render.
  const moved =
    hearts !== state.hearts ||
    max !== state.max ||
    tuning.hearts.regenMs !== DEFAULT_TUNING.hearts.regenMs;
  return {
    ...state,
    hearts,
    max,
    practiceLeft: Math.min(state.practiceLeft, tuning.hearts.practicePerHeart),
    nextRegenAt:
      state.unlimited || hearts >= max
        ? null
        : moved
          ? new Date(now + tuning.hearts.regenMs).toISOString()
          : state.nextRegenAt,
  };
}

/** The total XP that leaves the next lesson one short of the following level. */
export function xpJustBelowNextLevel(currentXp: number, tuning: Tuning): number {
  const level = levelForXp(currentXp, tuning.levelDivisor);
  const next = (level + 1) * (level + 1) * tuning.levelDivisor;
  // One correct answer short, so an ordinary lesson tips it over.
  return Math.max(0, next - Math.max(1, tuning.xp.correct));
}
