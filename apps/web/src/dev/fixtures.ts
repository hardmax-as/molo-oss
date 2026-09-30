/**
 * The one web development fixture, and the fabricated props the developer
 * gallery hands the real components. Development builds and `admin` accounts
 * only: nothing here is queried, saved or sent.
 *
 * **Every string of "isiXhosa" below is a `zz-` placeholder.** The web app
 * has no published content of its own to draw on, so rather than invent a
 * language it cannot check, the fixture is visibly not isiXhosa — the same
 * convention `/dev/playground` has always used, and the reason it is safe to
 * put it in front of a person.
 */

import type {
  CelebrationBeat,
  ExercisePayload,
  ExerciseType,
  GrammarNoteView,
  PathChestRow,
  PathLessonRow,
  PathRow,
  PathUnitRow,
  UnitResponse,
} from "@molo/core";
import { XP, buildPath, clickIdsForSet, type PathUnitInput } from "@molo/core";

import type { Content } from "~/components/exercises/types.ts";
import type { HeartsState, LeagueHistoryResponse, LeagueResponse } from "~/lib/api.ts";

const A = "00000000-0000-4000-8000-00000000aaaa";
const B = "00000000-0000-4000-8000-00000000bbbb";
const C = "00000000-0000-4000-8000-00000000cccc";
const S = "00000000-0000-4000-8000-0000000055ee";
const AUD = "00000000-0000-4000-8000-00000000d0d0";

export const FIXTURE_IDS = { a: A, b: B, c: C, sentence: S, audio: AUD } as const;

function lex(
  id: string,
  lemma: string,
  gloss: string,
  nounClass: string | null,
): UnitResponse["lexemes"][string] {
  return {
    id,
    lemma,
    pos: "noun",
    nounClass,
    isPlural: false,
    infinitive: null,
    register: "standard",
    gloss: { gloss, usageNote: null, contrastiveNote: null },
    audio: null,
    voices: [],
  };
}

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

/** Fixture content; every string is a placeholder, never real isiXhosa. */
export const DEMO_CONTENT: Content = {
  sourceLang: "en",
  lexemes: {
    [A]: lex(A, "zz-inca", "fixture alpha", "9"),
    [B]: lex(B, "zz-ixhala", "fixture beta", "5"),
    [C]: lex(C, "zz-iqanda", "fixture gamma", "5"),
  },
  sentences: {
    [S]: {
      id: S,
      textXh: "zz-inca zz-iyahamba zz-kakuhle",
      gloss: { gloss: "fixture sentence gloss", literalGloss: null },
      tokens: [
        { position: 0, lexemeId: A, surfaceForm: "zz-inca" },
        { position: 1, lexemeId: B, surfaceForm: "zz-iyahamba" },
        { position: 2, lexemeId: C, surfaceForm: "zz-kakuhle" },
      ],
      audio: null,
      voices: [],
    },
  },
  audioAssets: {},
  clickAudio: DEMO_CLICK_AUDIO,
};

/**
 * A grammar note, entirely fabricated. The "isiXhosa" is the same `zz-`
 * placeholder as everything else here, and the explanation is developer
 * English about a made-up language: a demo must never carry a claim about
 * isiXhosa, because a demo is not reviewed by an editor (docs/GRAMMAR.md).
 * The middle row has no recording on purpose — that is the case the
 * component has to draw honestly.
 */
export const DEMO_GRAMMAR_NOTE: GrammarNoteView = {
  id: "00000000-0000-4000-8000-00000000ff01",
  slug: "zz-demo-note",
  skillId: "00000000-0000-4000-8000-00000000f002",
  order: 1,
  rowHeaderKey: "class",
  sourceLang: "en",
  title: "Fixture rule about a fixture language",
  rule: "This paragraph stands in for an editor's explanation. Nothing here describes isiXhosa: the words are placeholders and the rule is invented, so the demo can be looked at without anyone mistaking it for teaching material.",
  correction: "This is the fixture pattern; look at the front of the placeholder.",
  cells: [
    {
      id: "zz-cell-0",
      role: "example",
      order: 0,
      rowLabel: "",
      colKey: "word",
      surfaceForm: "zz-inca",
      morphemes: ["zz", "inca"],
      lexemeId: A,
      audioAssetId: null,
    },
    {
      id: "zz-cell-1",
      role: "paradigm",
      order: 1,
      rowLabel: "9",
      colKey: "singular",
      surfaceForm: "zz-inca",
      morphemes: ["zz", "inca"],
      lexemeId: A,
      audioAssetId: null,
    },
    {
      id: "zz-cell-2",
      role: "paradigm",
      order: 2,
      rowLabel: "9",
      colKey: "plural",
      surfaceForm: "zz-izinca",
      morphemes: ["zzi", "inca"],
      lexemeId: null,
      audioAssetId: null,
    },
    {
      id: "zz-cell-3",
      role: "paradigm",
      order: 3,
      rowLabel: "5",
      colKey: "singular",
      surfaceForm: "zz-ixhala",
      morphemes: ["zz", "ixhala"],
      lexemeId: B,
      audioAssetId: null,
    },
    {
      id: "zz-cell-4",
      role: "paradigm",
      order: 4,
      rowLabel: "5",
      colKey: "plural",
      surfaceForm: "zz-amaxhala",
      morphemes: ["zzama", "ixhala"],
      lexemeId: null,
      audioAssetId: null,
    },
  ],
};

/** One payload per exercise type, so every widget can be looked at on its own. */
export const DEMO_PAYLOADS: Record<ExerciseType, ExercisePayload> = {
  listen_select: {
    type: "listen_select",
    prompt: { lexemeId: A },
    options: [
      { lexemeId: A, correct: true },
      { lexemeId: B, correct: false },
      { lexemeId: C, correct: false },
    ],
  },
  select_listen: {
    type: "select_listen",
    prompt: { lexemeId: B },
    options: [
      { lexemeId: B, correct: true },
      { lexemeId: C, correct: false },
    ],
  },
  match_pairs: { type: "match_pairs", pairs: [{ lexemeId: A }, { lexemeId: B }, { lexemeId: C }] },
  class_sort: {
    type: "class_sort",
    buckets: ["5", "9"],
    items: [{ lexemeId: A }, { lexemeId: B }, { lexemeId: C }],
  },
  translate_tap: { type: "translate_tap", sentenceId: S, distractorLexemeIds: [] },
  translate_type: { type: "translate_type", sentenceId: S },
  concord_fill: {
    type: "concord_fill",
    sentenceId: S,
    blanks: [
      {
        position: 1,
        lexemeId: B,
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
    contrastWords: [
      { lexemeId: A, click: "c" },
      { lexemeId: B, click: "x" },
      { lexemeId: C, click: "q" },
    ],
  },
  speak: { type: "speak", prompt: { lexemeId: A }, referenceAudioAssetId: AUD },
  culture_card: {
    type: "culture_card",
    title: { en: "Fixture card", nb: "Fikstur-kort" },
    body: { en: "A culture card body.", nb: "Innholdet i et kulturkort." },
    lexemeIds: [],
  },
  click_identify: { type: "click_identify", set: "A", clicks: clickIdsForSet("A") },
};

/**
 * The order `/dev/playground` runs them in: the whole set, once each. The
 * first three are load-bearing — `e2e/tests/word-hints.spec.ts` answers its
 * way through them — so new types go on the end.
 */
export const EXERCISE_ORDER: readonly ExerciseType[] = [
  "listen_select",
  "translate_type",
  "concord_fill",
  "speak",
  "match_pairs",
  "translate_tap",
  "class_sort",
  "culture_card",
  "select_listen",
  "click_drill",
  "click_identify",
];

// ---------------------------------------------------------------------------
// After a lesson
// ---------------------------------------------------------------------------

/** Monday first; the learner has been active on four days, today included. */
const WEEK = [true, true, false, true, true, false, false];

/** Everything the playground's run could earn, for `celebrationBeats`. */
export const EXTRAS = {
  streak: { days: 5, extended: true, frozen: false, week: WEEK, todayIndex: 4 },
  words: { learned: 50, before: 44 },
  unit: { slug: "unit-1", titleKey: "units.unit1.title", completed: true, flawless: true },
} as const;

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
const UNIT_SLUG = "zz-playground";

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
    slug: UNIT_SLUG,
    titleKey: "units.unit1.title",
    cefrBand: "A1",
    locked: options.locked ?? false,
    prerequisiteSlug: options.locked === true ? "zz-playground-0" : null,
    prerequisiteTitleKey: null,
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
  return demoPathRows({ locked }).find((r) => r.type === "unit") as PathUnitRow;
}

function lessonRow(over: Partial<PathLessonRow>): PathLessonRow {
  return {
    type: "lesson",
    key: `lesson:${over.lessonId ?? "x"}`,
    unitId: UNIT_ID,
    unitSlug: UNIT_SLUG,
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
    unitSlug: UNIT_SLUG,
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
    "zz-Thandi",
    "zz-Sipho",
    "zz-Nomvula",
    "zz-Anele",
    "zz-Lwazi",
    "zz-Buhle",
    "zz-Kagiso",
    "zz-Zola",
  ];
  return {
    league: {
      id: "zz-fixture",
      tier: "silver",
      weekStart: "2026-08-31",
      weekEnd: "2026-09-06",
      size: 20,
    },
    standings: names.map((name, i) => ({
      userId: `zz-${i}`,
      // One hidden row, so the gallery shows what a hidden name looks like.
      name: i === 6 ? null : name,
      hidden: i === 6,
      xp: 420 - i * 45,
      rank: i + 1,
      isMe: i === 3,
    })),
    me: { rank: 4, xp: 285, zone: "promote" },
    rules: { size: 20, promote: 5, demote: 5 },
  };
}

export const DEMO_LEAGUE_HISTORY: LeagueHistoryResponse = {
  weeks: [
    { weekStart: "2026-08-24", tier: "bronze", rank: 3, xp: 410, outcome: "promoted" },
    { weekStart: "2026-08-17", tier: "bronze", rank: 9, xp: 180, outcome: "stayed" },
  ],
};

/** The lexeme a practice card is drawn for. */
export const RECALL_LEXEME = DEMO_CONTENT.lexemes[A];
