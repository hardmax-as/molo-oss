/**
 * DEVELOPER-ONLY ENGLISH. Every string in this file is read by whoever is
 * building the app and by nobody else: the developer gallery is reachable
 * only from a `__DEV__` build or an `admin` account (see `useDevAccess`), so
 * none of it is ever on a learner's screen. Learner-facing copy lives in
 * `packages/i18n` and is translated; this is not, on purpose — a developer
 * tool that has to be kept in two languages stops being maintained.
 *
 * This is the only file in apps/mobile allowed to hold untranslated copy.
 */

export const DEV_STRINGS = {
  /** The Settings row and the screen it pushes. */
  settingsRow: "Developer",
  settingsRowHint: "Screens, celebrations and states without playing your way to them",
  title: "Developer",
  gallery: "Gallery",
  galleryHint: "Every screen and celebration, with fabricated content. Nothing is saved.",

  /** The state panel at the top of the Developer screen. */
  api: "API",
  account: "Account",
  signedOut: "Signed out (guest)",
  roles: "Roles",
  noRoles: "none",
  version: "Version",
  build: "Build",
  buildUnknown: "—",
  reduceMotion: "Reduce motion",
  reduceMotionHint: "The in-app override; off follows the device setting",
  quietMode: "Quiet mode",
  quietModeHint: "Session-only: listening exercises become reading ones",

  /** The buttons. */
  clearGuest: "Clear guest store",
  clearGuestDone: "Guest store cleared",
  clearOnboarding: "Clear onboarding flag",
  clearOnboardingDone: "Onboarding flag cleared — the welcome flow runs again",
  signOut: "Sign out",
  back: "Back",
  replay: "Replay",

  /** Group headings, in the order a person looks for them. */
  groups: {
    "after-lesson": "After a lesson",
    "in-lesson": "During a lesson",
    path: "The path",
    walls: "Walls and sheets",
    elsewhere: "Elsewhere",
  },

  /** A demo that opens one of the app's real routes rather than a fabricated view. */
  opensRealScreen: "Opens the real screen",

  /**
   * The knobs panel. The same panel as the web app's `/dev/knobs`, the same
   * model and the same promise: an override lives on this device, changes
   * only what the client shows, and is cleared by one button.
   */
  knobs: {
    row: "Knobs",
    rowHint: "Turn a gamification constant and watch the consequence, on this device only",
    title: "Knobs",
    intro:
      "Every value below is one of the gamification constants in packages/core. An override lives on this device only, for this install, and changes what the client shows — never what the server awards or stores. Finish a lesson with XP per answer at 200 and the celebration counts to 200; the row the API wrote still says 10.",
    serverNote: "The server is the authority. Nothing here is sent anywhere.",
    groups: {
      rewards: "Rewards",
      hearts: "Hearts",
      streak: "Streak",
      celebration: "Celebration thresholds",
    },
    shipped: "shipped",
    resetOne: "Reset",
    reset: "Reset everything",
    nothingSet: "Nothing is overridden: every screen is showing the shipped constants.",
    bannerTitle: "Developer overrides are on.",
    bannerCount: (n: number) => `${n} value${n === 1 ? "" : "s"} overridden.`,
    bannerServer: "Display only.",
    units: { minutes: "min", xp: "XP", inARow: "in a row", words: "words" },
    decrease: (label: string) => `${label}: less`,
    increase: (label: string) => `${label}: more`,

    /** One entry per knob id, so `knobs.ts` holds numbers and this holds words. */
    specs: {
      "xp.correct": {
        label: "XP per correct answer",
        hint: "Every exercise except the click drill",
      },
      "xp.perfectLessonBonus": {
        label: "XP for a flawless lesson",
        hint: "Added on top when every answer was right",
      },
      "xp.clickDrillCorrect": {
        label: "XP per click-drill answer",
        hint: "The pronunciation drill pays more, per step",
      },
      "xp.speakAttempt": {
        label: "XP per speaking attempt",
        hint: "Paid whether or not the attempt was good",
      },
      "xp.skillChest": { label: "Chest bonus", hint: "Granted once per learner per skill" },
      "level.divisor": {
        label: "Level curve divisor",
        hint: "level = floor(sqrt(xp / divisor)); smaller is a faster climb",
      },
      "goal.dailyXp": { label: "Daily goal", hint: "The ring in the strip fills against this" },
      "hearts.max": { label: "Hearts", hint: "How many wrong answers a lesson survives" },
      "hearts.regenMinutes": {
        label: "One heart back every",
        hint: "Regeneration is derived from the last change, not ticked",
      },
      "hearts.practicePerHeart": {
        label: "Practice ratings per heart",
        hint: "How much review earns one heart back",
      },
      "streak.freezePerWeek": {
        label: "Streak freezes per week",
        hint: "Plus only; a freeze covers one missed day",
      },
      "run.minToShow": {
        label: "Run counter appears at",
        hint: "Below this a run of right answers is not worth saying",
      },
      "run.hotAt": {
        label: "Run counter turns hot at",
        hint: "The strip takes the warmer colour",
      },
    },
    milestoneLabel: (n: number) => `Word milestone ${n}`,
    milestoneHint: "Crossing it during a lesson earns the medal beat",

    states: {
      title: "Fabricated states",
      hint: "Put the client into a state that is otherwise tedious to reach. All of it is fake, all of it is this device only, and a reload of the server's own numbers replaces none of it — the fake is applied on top every time.",
      streak: "Streak",
      streakSet: "Set the streak",
      streakHint: "What the strip's flame claims, in days",
      heartsEmpty: "Empty the hearts",
      heartsEmptyHint: "The next wrong answer walks into the out-of-hearts wall",
      heartsFull: "Fill the hearts",
      xpNearLevel: "XP one lesson below the next level",
      xpNearLevelHint: "Finish anything and watch the level-up",
      unitFinished: "Mark a unit finished",
      unitFinishedHint: "Slug of the unit the path should draw as complete",
      clear: "Clear",
      active: "fake",
    },
  },

  /** Captions inside a demo, where one view shows several variants. */
  captions: {
    listening: "listening — the sunbird",
    teaching: "teaching — the crane",
    producing: "producing — the penguin",
    chestReady: "ready",
    chestClaimed: "claimed",
    guideFirst: "first visit",
    guideBack: "after a week away",
    crownLevel: "crown level",
    reveal: "Reveal",
    hide: "Hide the answer",
    signedInOnly:
      "The action appears for everyone; what it opens depends on whether there is an account. Both are below.",
    openReport: "Open the report sheet (signed in)",
    openReportGuest: "Open the account wall (guest)",
    toastIndigo: "Indigo toast",
    toastSea: "Sea toast",
    toastCoral: "Coral toast",
    toastMessage: "A short message, gone in a few seconds",
    wordHint: "Tap a word for its gloss; the word under test is plain text.",
  },
} as const;
