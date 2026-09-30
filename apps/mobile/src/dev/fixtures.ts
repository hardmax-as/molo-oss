/**
 * The fabricated props the developer gallery hands the real components.
 * __DEV__/admin only: nothing here is ever queried, saved or sent.
 *
 * Two rules govern the content:
 *
 * - **No invented isiXhosa.** Every word comes from `~/fixtures/demo-unit.ts`,
 *   which carries the isixhosa.click entries the Unit 1 spike references.
 * - Where a demo needs a *tokenised* sentence and the fixture has none, the
 *   tokens are `zz-` placeholders — visibly not isiXhosa — exactly as the web
 *   playground does. A placeholder is honest; a plausible sentence is not.
 */

import type {
  CelebrationBeat,
  ExercisePayload,
  ExerciseType,
  PathChestRow,
  PathLessonRow,
  PathRow,
  PathUnitRow,
  UnitResponse,
} from "@molo/core";
import { XP, buildPath, clickIdsForSet, type PathUnitInput } from "@molo/core";

import type { Content } from "~/components/exercises/types.ts";
import { demoUnit, DEMO_IDS } from "~/fixtures/demo-unit.ts";
import type { LeagueHistoryResponse, LeagueResponse } from "~/lib/api.ts";
import type { HeartsState } from "~/lib/hearts-format.ts";

/** A sentence with tokens, for the demos that need one. Placeholders, not isiXhosa. */
const PLACEHOLDER_SENTENCE_ID = "00000000-0000-4000-8000-00000000f202";
const AUDIO_ASSET_ID = "00000000-0000-4000-8000-00000000f301";

/**
 * A silent clip standing in for each bare click. The gallery must show the
 * tiles, not the "nothing recorded" state, and there is no real recording
 * to borrow: a studio take of a click is content, and nothing is published.
 */
const SILENT_CLIP =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const DEMO_CLICK_AUDIO = Object.fromEntries(
  clickIdsForSet("A").map((id) => [
    id,
    {
      id,
      url: SILENT_CLIP,
      tier: "1_native_studio" as const,
      durationMs: 300,
      attribution: null,
      speaker: null,
    },
  ]),
);

/**
 * The dev unit plus one tokenised placeholder sentence. Built once: the
 * widgets seed their shuffles from ids, so a stable object keeps a demo
 * looking the same each time it is opened.
 */
export const DEMO_CONTENT: Content = (() => {
  const unit: UnitResponse = demoUnit("en");
  return {
    sourceLang: unit.sourceLang,
    lexemes: unit.lexemes,
    audioAssets: unit.audioAssets,
    clickAudio: DEMO_CLICK_AUDIO,
    sentences: {
      ...unit.sentences,
      [PLACEHOLDER_SENTENCE_ID]: {
        id: PLACEHOLDER_SENTENCE_ID,
        textXh: "zz-inca zz-iyahamba zz-kakuhle",
        gloss: { gloss: "fixture sentence gloss (placeholder, not isiXhosa)", literalGloss: null },
        tokens: [
          { position: 0, lexemeId: DEMO_IDS.umntu, surfaceForm: "zz-inca" },
          { position: 1, lexemeId: DEMO_IDS.umthi, surfaceForm: "zz-iyahamba" },
          { position: 2, lexemeId: DEMO_IDS.inja, surfaceForm: "zz-kakuhle" },
        ],
        audio: null,
        voices: [],
      },
    },
  };
})();

/** One payload per exercise type, so every widget can be looked at on its own. */
export const DEMO_PAYLOADS: Record<ExerciseType, ExercisePayload> = {
  listen_select: {
    type: "listen_select",
    prompt: { lexemeId: DEMO_IDS.molo },
    options: [
      { lexemeId: DEMO_IDS.molo, correct: true },
      { lexemeId: DEMO_IDS.molweni, correct: false },
      { lexemeId: DEMO_IDS.enkosi, correct: false },
    ],
  },
  select_listen: {
    type: "select_listen",
    prompt: { lexemeId: DEMO_IDS.enkosi },
    options: [
      { lexemeId: DEMO_IDS.enkosi, correct: true },
      { lexemeId: DEMO_IDS.uxolo, correct: false },
    ],
  },
  match_pairs: {
    type: "match_pairs",
    pairs: [
      { lexemeId: DEMO_IDS.molo },
      { lexemeId: DEMO_IDS.molweni },
      { lexemeId: DEMO_IDS.enkosi },
      { lexemeId: DEMO_IDS.uxolo },
    ],
  },
  class_sort: {
    type: "class_sort",
    buckets: ["1", "3", "5", "7", "9"],
    items: [
      { lexemeId: DEMO_IDS.umntu },
      { lexemeId: DEMO_IDS.umthi },
      { lexemeId: DEMO_IDS.igama },
      { lexemeId: DEMO_IDS.isikolo },
      { lexemeId: DEMO_IDS.inja },
    ],
  },
  translate_tap: {
    type: "translate_tap",
    sentenceId: DEMO_IDS.sentence,
    distractorLexemeIds: [DEMO_IDS.molweni, DEMO_IDS.enkosi],
  },
  translate_type: { type: "translate_type", sentenceId: DEMO_IDS.sentence },
  concord_fill: {
    type: "concord_fill",
    sentenceId: PLACEHOLDER_SENTENCE_ID,
    blanks: [
      {
        position: 1,
        lexemeId: DEMO_IDS.umthi,
        form: "subject_concord",
        distractors: ["zz-uyahamba", "zz-bayahamba"],
      },
    ],
  },
  click_drill: {
    type: "click_drill",
    set: "A",
    contrast: ["c", "x", "q"],
    steps: ["listen_identify"],
    pairs: [],
    contrastWords: [{ lexemeId: DEMO_IDS.uxolo, click: "x" }],
  },
  speak: {
    type: "speak",
    prompt: { lexemeId: DEMO_IDS.molo },
    referenceAudioAssetId: AUDIO_ASSET_ID,
  },
  culture_card: {
    type: "culture_card",
    title: { en: "Fixture card (dev only)", nb: "Fikstur-kort (kun utvikling)" },
    body: {
      en: "A culture card carries a short editor-written note and scores nothing.",
      nb: "Et kulturkort har en kort redaktørskrevet merknad og gir ingen poeng.",
    },
    lexemeIds: [DEMO_IDS.molo, DEMO_IDS.molweni],
  },
  click_identify: { type: "click_identify", set: "A", clicks: clickIdsForSet("A") },
};

/** The word hint's tokens: two with a gloss, one the exercise is "testing". */
export const DEMO_SENTENCE_ID = PLACEHOLDER_SENTENCE_ID;

// ---------------------------------------------------------------------------
// After a lesson
// ---------------------------------------------------------------------------

/** Monday first; the learner has been active on four days, today included. */
const WEEK = [true, true, false, true, true, false, false];

export const LESSON_BEAT: CelebrationBeat = {
  kind: "lesson",
  xp: 120,
  correct: 8,
  total: 10,
  perfect: false,
  accuracy: 80,
};

export const LESSON_BEAT_FLAWLESS: CelebrationBeat = {
  kind: "lesson",
  xp: 165,
  correct: 10,
  total: 10,
  perfect: true,
  accuracy: 100,
};

export function streakBeat(frozen: boolean): CelebrationBeat {
  return { kind: "streak", days: frozen ? 12 : 5, frozen, week: WEEK, todayIndex: 4 };
}

export function milestoneBeat(threshold: number): CelebrationBeat {
  return { kind: "milestone", threshold, words: threshold + 2 };
}

export function unitBeat(flawless: boolean): CelebrationBeat {
  return { kind: "unit", slug: "unit-1", titleKey: "units.unit1.title", flawless };
}

/** Everything a very good lesson could earn, in the order the beats always play. */
export const FULL_SEQUENCE: readonly CelebrationBeat[] = [
  LESSON_BEAT_FLAWLESS,
  streakBeat(false),
  milestoneBeat(50),
  unitBeat(true),
];

// ---------------------------------------------------------------------------
// The path
// ---------------------------------------------------------------------------

const UNIT_ID = "00000000-0000-4000-8000-00000000e001";
const SKILL_ID = "00000000-0000-4000-8000-00000000e002";

/**
 * A unit with a finished lesson, the one the learner is pointed at, two
 * still to come and a chest at the end. `buildPath` decides the states and
 * the winding, exactly as it does for a real unit.
 */
export function demoPathRows(
  options: { locked?: boolean; chestClaimed?: boolean } = {},
): readonly PathRow[] {
  const unit: PathUnitInput = {
    id: UNIT_ID,
    slug: "dev-fixture-unit-1",
    titleKey: "units.unit1.title",
    cefrBand: "A1",
    locked: options.locked ?? false,
    prerequisiteSlug: options.locked === true ? "dev-fixture-unit-0" : null,
    prerequisiteTitleKey: options.locked === true ? "units.unit1.title" : null,
    skills: [
      {
        id: SKILL_ID,
        slug: "greetings",
        titleKey: "units.unit1.skills.greetings.title",
        kind: "vocab",
        chestClaimed: options.chestClaimed ?? false,
        lessons: [
          {
            id: "l1",
            order: 1,
            kind: "listen",
            estimatedMinutes: 3,
            exerciseCount: 8,
            crownLevel: 2,
          },
          {
            id: "l2",
            order: 2,
            kind: "speak",
            estimatedMinutes: 4,
            exerciseCount: 9,
            crownLevel: 0,
          },
          {
            id: "l3",
            order: 3,
            kind: "culture",
            estimatedMinutes: 2,
            exerciseCount: 3,
            crownLevel: 0,
          },
          {
            id: "l4",
            order: 4,
            kind: "test",
            estimatedMinutes: 5,
            exerciseCount: 12,
            crownLevel: 0,
          },
        ],
      },
    ],
  };
  return buildPath([unit], { chestXp: XP.skillChest });
}

export function demoUnitRow(locked: boolean): PathUnitRow {
  const row = demoPathRows({ locked }).find((r) => r.type === "unit");
  return row as PathUnitRow;
}

function lessonRow(over: Partial<PathLessonRow>): PathLessonRow {
  return {
    type: "lesson",
    key: `lesson:${over.lessonId ?? "x"}`,
    unitId: UNIT_ID,
    unitSlug: "dev-fixture-unit-1",
    skillId: SKILL_ID,
    lessonId: "x",
    order: 1,
    kind: "mixed",
    estimatedMinutes: 3,
    exerciseCount: 8,
    crownLevel: 0,
    state: "open",
    offset: 0,
    index: 0,
    ...over,
  };
}

/** Every node kind, each in the state that shows it best. */
export const NODE_KINDS: readonly PathLessonRow[] = [
  lessonRow({ lessonId: "k1", order: 1, kind: "listen", state: "done", crownLevel: 3 }),
  lessonRow({ lessonId: "k2", order: 2, kind: "speak", state: "current" }),
  lessonRow({ lessonId: "k3", order: 3, kind: "culture", state: "open" }),
  lessonRow({ lessonId: "k4", order: 4, kind: "test", state: "open" }),
  lessonRow({ lessonId: "k5", order: 5, kind: "mixed", state: "locked" }),
];

/** One node per crown level, so the badge can be read at every step. */
export const CROWN_LEVELS: readonly PathLessonRow[] = [1, 2, 3, 4, 5].map((level) =>
  lessonRow({
    lessonId: `c${level}`,
    order: level,
    kind: "mixed",
    state: "done",
    crownLevel: level,
  }),
);

export function chestRow(state: PathChestRow["state"]): PathChestRow {
  return {
    type: "chest",
    key: `chest:${state}`,
    unitId: UNIT_ID,
    unitSlug: "dev-fixture-unit-1",
    skillId: SKILL_ID,
    titleKey: "units.unit1.skills.greetings.title",
    state,
    xp: XP.skillChest,
    index: 4,
  };
}

// ---------------------------------------------------------------------------
// Walls, sheets and elsewhere
// ---------------------------------------------------------------------------

export const NO_HEARTS: HeartsState = {
  hearts: 0,
  max: 5,
  unlimited: false,
  nextRegenAt: new Date(Date.now() + 66 * 60_000).toISOString(),
  practiceLeft: 2,
};

export function demoLeague(populated: boolean): LeagueResponse {
  if (!populated)
    return { league: null, standings: [], me: null, rules: { size: 20, promote: 5, demote: 5 } };
  const names = [
    "Anele",
    "Thandi",
    "Sipho",
    "Nomvula",
    "Lwazi",
    "Buhle",
    "Zola",
    "Vuyo",
    "Aya",
    "Kai",
  ];
  return {
    league: { id: "zz", tier: "silver", weekStart: "2026-08-31", weekEnd: "2026-09-06", size: 20 },
    standings: names.map((name, i) => ({
      userId: `zz-${i}`,
      // One hidden row, so the gallery shows what a hidden name looks like.
      name: i === 7 ? null : name,
      hidden: i === 7,
      xp: 320 - i * 27,
      rank: i + 1,
      isMe: i === 4,
    })),
    me: { rank: 5, xp: 212, zone: "promote" },
    rules: { size: 20, promote: 5, demote: 5 },
  };
}

export const DEMO_LEAGUE_HISTORY: LeagueHistoryResponse = {
  weeks: [
    { weekStart: "2026-08-24", tier: "bronze", rank: 3, xp: 410, outcome: "promoted" },
    { weekStart: "2026-08-17", tier: "bronze", rank: 9, xp: 180, outcome: "stayed" },
  ],
};

/** The lexeme a recall card is drawn for: a fixture word, with no audio. */
export const RECALL_LEXEME = DEMO_CONTENT.lexemes[DEMO_IDS.enkosi];
