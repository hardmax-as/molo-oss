/**
 * What the developer gallery lists, and nothing else: ids, groups and the
 * developer-only English that names them. Pure — no React, no fixtures — so
 * the unit suite can hold it to its rules without pulling the app in. The
 * views that render each id live in `views.tsx`.
 *
 * Adding a demo is two edits: an entry here, and a view for its id in
 * `views.tsx` (which `Record<ViewDemoId, …>` makes the compiler insist on).
 */

import { DEV_STRINGS } from "./strings.ts";

export const DEMO_GROUPS = ["after-lesson", "in-lesson", "path", "walls", "elsewhere"] as const;
export type DemoGroup = (typeof DEMO_GROUPS)[number];

export interface DemoEntry {
  /** Stable, lower-case and hyphenated: it is the route parameter. */
  readonly id: string;
  readonly group: DemoGroup;
  /** Developer-only English (see `strings.ts`). */
  readonly title: string;
  readonly note: string;
  /**
   * A page the app already routes to. The gallery links there instead of
   * rendering a fabricated view, because the real page is the honest demo of
   * itself.
   */
  readonly href?: string;
}

export const DEMOS = [
  // --- after a lesson ----------------------------------------------------
  {
    id: "lesson-complete",
    group: "after-lesson",
    title: "Lesson complete",
    note: "An ordinary run: 8 of 10 right",
  },
  {
    id: "lesson-complete-flawless",
    group: "after-lesson",
    title: "Lesson complete, flawless",
    note: "Every answer right: the cheer pose, the bigger burst",
  },
  {
    id: "streak-extended",
    group: "after-lesson",
    title: "Streak extended",
    note: "Day five, with the Monday-first week strip",
  },
  {
    id: "streak-frozen",
    group: "after-lesson",
    title: "Streak saved by a freeze",
    note: "A Plus freeze covered the missed day: saved, not extended",
  },
  { id: "milestone-25", group: "after-lesson", title: "Milestone: 25 words", note: "The medal" },
  { id: "milestone-50", group: "after-lesson", title: "Milestone: 50 words", note: "The medal" },
  { id: "milestone-100", group: "after-lesson", title: "Milestone: 100 words", note: "The medal" },
  { id: "milestone-250", group: "after-lesson", title: "Milestone: 250 words", note: "The medal" },
  { id: "milestone-500", group: "after-lesson", title: "Milestone: 500 words", note: "The medal" },
  {
    id: "unit-finished",
    group: "after-lesson",
    title: "Unit finished",
    note: "The sea crown and the trio's bow",
  },
  {
    id: "unit-finished-flawless",
    group: "after-lesson",
    title: "Unit finished, flawless",
    note: "The gold crown with its shimmer",
  },
  {
    id: "celebration-sequence",
    group: "after-lesson",
    title: "The whole sequence",
    note: "Lesson, streak, milestone and unit end to end from one fabricated result",
  },
  {
    id: "level-up",
    group: "after-lesson",
    title: "Level up",
    note: "The card that waits until the sequence is over",
  },

  // --- during a lesson ---------------------------------------------------
  {
    id: "exercise-listen-select",
    group: "in-lesson",
    title: "Exercise: listen and select",
    note: "Fixture content, no audio",
  },
  {
    id: "exercise-select-listen",
    group: "in-lesson",
    title: "Exercise: select then listen",
    note: "Fixture content, no audio",
  },
  {
    id: "exercise-match-pairs",
    group: "in-lesson",
    title: "Exercise: match pairs",
    note: "Fixture content",
  },
  {
    id: "exercise-class-sort",
    group: "in-lesson",
    title: "Exercise: class sort",
    note: "Three nouns into two class buckets",
  },
  {
    id: "exercise-translate-tap",
    group: "in-lesson",
    title: "Exercise: translate by tapping",
    note: "Fixture sentence tiles",
  },
  {
    id: "exercise-translate-type",
    group: "in-lesson",
    title: "Exercise: translate by typing",
    note: "Fixture sentence",
  },
  {
    id: "exercise-concord-fill",
    group: "in-lesson",
    title: "Exercise: concord fill",
    note: "Fixture blank with xh-morph-shaped distractors",
  },
  {
    id: "exercise-click-drill",
    group: "in-lesson",
    title: "Exercise: click drill",
    note: "The identify step; the drill has no recording",
  },
  {
    id: "exercise-speak",
    group: "in-lesson",
    title: "Exercise: speak",
    note: "Asks for the microphone; skips without one",
  },
  {
    id: "exercise-culture-card",
    group: "in-lesson",
    title: "Exercise: culture card",
    note: "Fixture card, no scoring",
  },
  {
    id: "exercise-click-identify",
    group: "in-lesson",
    title: "Exercise: which click",
    note: "Set A (c, x, q) with silent stand-in clips",
  },
  {
    id: "badge-new-word",
    group: "in-lesson",
    title: "Badge: new word",
    note: "The sun badge above a prompt",
  },
  {
    id: "badge-tricky",
    group: "in-lesson",
    title: "Badge: tricky",
    note: "The coral badge above a prompt",
  },
  {
    id: "run-counter-three",
    group: "in-lesson",
    title: "Run counter at three",
    note: "The strip turns sea and says how long the run is",
  },
  {
    id: "run-counter-seven",
    group: "in-lesson",
    title: "Run counter at seven",
    note: "Hot: the strip shimmers and the wording changes",
  },
  {
    id: "speech-bubble",
    group: "in-lesson",
    title: "Mascot speech bubble",
    note: "All three speakers: listening, teaching, producing",
  },
  {
    id: "word-hint-open",
    group: "in-lesson",
    title: "Word hint, open",
    note: "One word with its gloss showing, one the exercise is testing",
  },
  {
    id: "check-bar-unanswered",
    group: "in-lesson",
    title: "Check bar: unanswered",
    note: "Before a verdict",
  },
  { id: "check-bar-right", group: "in-lesson", title: "Check bar: right", note: "The sea verdict" },
  {
    id: "check-bar-wrong",
    group: "in-lesson",
    title: "Check bar: wrong",
    note: "The coral verdict with the answer and a hint",
  },
  {
    id: "grammar-note",
    group: "in-lesson",
    title: "Grammar note before the drill",
    note: "Worked example, the rule, then a paradigm with a play button per cell",
  },
  {
    id: "grammar-correction",
    group: "in-lesson",
    title: "Check bar: wrong, with the pattern named",
    note: "The correction rides inside the bar's existing live region",
  },
  {
    id: "grammar-morphemes",
    group: "in-lesson",
    title: "Morphemes split",
    note: "One word as its parts, and the same word with nothing recorded to split it",
  },
  {
    id: "report-exercise",
    group: "in-lesson",
    title: "Report this exercise",
    note: "The dialog itself; sending needs a signed-in account and a real exercise",
  },

  // --- the path ----------------------------------------------------------
  {
    id: "path-unit-open",
    group: "path",
    title: "Unit stretch, open",
    note: "Done, current and open nodes with their chest",
  },
  {
    id: "path-unit-locked",
    group: "path",
    title: "Unit stretch, locked",
    note: "The prerequisite lock: every node a real disabled button",
  },
  {
    id: "path-node-kinds",
    group: "path",
    title: "Every node kind",
    note: "Listen, speak, culture, test and mixed, in each state",
  },
  { id: "path-chest-ready", group: "path", title: "Chest ready", note: "Pulsing, worth 25 XP" },
  {
    id: "path-chest-claimed",
    group: "path",
    title: "Chest claimed",
    note: "Opened once, and it stays opened",
  },
  {
    id: "path-crown-levels",
    group: "path",
    title: "Crown levels 1 to 5",
    note: "The badge on a finished node; five is a star",
  },
  {
    id: "path-guide",
    group: "path",
    title: "The guide with a bubble",
    note: "First visit, and after a week away",
  },

  // --- walls and sheets ---------------------------------------------------
  {
    id: "out-of-hearts",
    group: "walls",
    title: "Out of hearts, with a way back",
    note: "The Later button is there when the lesson can be left",
  },
  {
    id: "out-of-hearts-no-way-back",
    group: "walls",
    title: "Out of hearts, no way back",
    note: "Practise or Plus, and nothing else",
  },
  {
    id: "save-progress-wall",
    group: "walls",
    title: "Save your progress",
    note: "The guest account wall with the XP they would keep",
  },
  {
    id: "plus-paywall",
    group: "walls",
    title: "Molo Plus",
    note: "The real page, with whatever prices are configured",
    href: "/plus",
  },

  // --- elsewhere ----------------------------------------------------------
  {
    id: "onboarding",
    group: "elsewhere",
    title: "Onboarding, from the first step",
    note: "The real welcome flow; finishing it writes the onboarding draft",
    href: "/welcome",
  },
  {
    id: "leagues-populated",
    group: "elsewhere",
    title: "Leagues, populated",
    note: "A silver cohort of eight with promotion and demotion zones",
  },
  { id: "leagues-empty", group: "elsewhere", title: "Leagues, empty", note: "Not in a cohort yet" },
  {
    id: "review-session",
    group: "elsewhere",
    title: "Review session",
    note: "The practice card with the four FSRS ratings",
  },
  {
    id: "mistakes-session",
    group: "elsewhere",
    title: "Mistakes session",
    note: "The same card with the two remediation buttons",
  },
  { id: "toasts", group: "elsewhere", title: "Toasts", note: "Each tone the app uses" },
  {
    id: "launch",
    group: "elsewhere",
    title: "Launch animation",
    note: "The first second, replayable",
  },
] as const satisfies readonly DemoEntry[];

export type DemoId = (typeof DEMOS)[number]["id"];
/** Demos that open one of the app's own pages. */
export type ScreenDemoId = Extract<(typeof DEMOS)[number], { href: string }>["id"];
/** Demos the gallery renders itself; `views.tsx` must have one for each. */
export type ViewDemoId = Exclude<DemoId, ScreenDemoId>;

/**
 * The catalogue as plain entries. `DEMOS` keeps its literal tuple type so
 * `ViewDemoId` can be derived from it, which also means an entry without an
 * `href` has no such property to read; anything that walks the list wants
 * this instead.
 */
export function allDemos(): readonly DemoEntry[] {
  return DEMOS;
}

export function demoById(id: string): DemoEntry | undefined {
  return DEMOS.find((d) => d.id === id);
}

export function demosIn(group: DemoGroup): readonly DemoEntry[] {
  return DEMOS.filter((d) => d.group === group);
}

/** The gallery's own order: groups as listed, demos as listed inside them. */
export function groupedDemos(): readonly {
  group: DemoGroup;
  title: string;
  demos: readonly DemoEntry[];
}[] {
  return DEMO_GROUPS.map((group) => ({
    group,
    title: DEV_STRINGS.groups[group],
    demos: demosIn(group),
  }));
}
