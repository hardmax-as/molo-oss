/**
 * DEVELOPER-ONLY ENGLISH. Every string in this file is read by whoever is
 * building the app and by nobody else: the developer gallery is reachable
 * only from a development build or an `admin` account (see `access.ts`), so
 * none of it is ever on a learner's screen. Learner-facing copy lives in
 * `packages/i18n` and is translated; this is not, on purpose — a developer
 * tool that has to be kept in two languages stops being maintained.
 *
 * This is the only file in apps/web allowed to hold untranslated copy.
 */

export const DEV_STRINGS = {
  settingsRow: "Developer",
  settingsRowHint: "Screens, celebrations and states without playing your way to them",
  title: "Developer gallery",
  intro:
    "Every screen and celebration, rendered from the app's own components with fabricated props. Nothing here is saved and nothing calls a paid API.",
  denied: "A development build or an admin account is needed for this page.",
  back: "Back to the gallery",
  replay: "Replay",
  otherPages: "Other developer pages",
  playground: "Playground",
  playgroundHint: "The lesson runner over the zz- fixture, end to end",
  mascots: "Mascots",
  mascotsHint: "The trio in every pose, on every surface",
  opensRealScreen: "Opens the real screen",

  knobs: {
    title: "Knobs",
    hint: "Turn a number and see the consequence, on the demos and on the real screens",
    intro:
      "Every value below is one of the gamification constants in packages/core. An override lives in this browser only, for this session, and changes what the client shows — never what the server awards or stores. Finish a lesson with XP per answer at 200 and the celebration counts to 200; the row the API wrote still says 10.",
    serverNote: "The server is the authority. Nothing here is sent anywhere, and nothing persists.",
    groups: {
      rewards: "Rewards",
      hearts: "Hearts",
      streak: "Streak",
      celebration: "Celebration thresholds",
    },
    shipped: "shipped",
    resetOne: "Reset",
    reset: "Reset everything",
    resetHint: "Clears every override and every fabricated state",
    nothingSet: "Nothing is overridden: every screen is showing the shipped constants.",
    bannerTitle: "Developer overrides are on.",
    bannerCount: (n: number) => `${n} value${n === 1 ? "" : "s"} overridden.`,
    bannerServer: "Display only — the server is unaffected.",
    bannerOpen: "Open the knobs",

    states: {
      title: "Fabricated states",
      hint: "Put the client into a state that is otherwise tedious to reach. All of it is fake, all of it is this browser only, and a reload of the server's own numbers replaces none of it — the fake is applied on top every time.",
      streak: "Streak",
      streakSet: "Set the streak",
      streakHint: "What the header's flame claims, in days",
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

  groups: {
    "after-lesson": "After a lesson",
    "in-lesson": "During a lesson",
    path: "The path",
    walls: "Walls and sheets",
    elsewhere: "Elsewhere",
  },

  captions: {
    listening: "listening — the sunbird",
    teaching: "teaching — the crane",
    producing: "producing — the penguin",
    chestReady: "ready",
    chestClaimed: "claimed",
    guideFirst: "first visit",
    guideBack: "after a week away",
    crownLevel: "crown level",
    hide: "Hide the answer",
    signedInOnly:
      "The action appears for everyone; what it opens depends on whether there is an account. Both are below.",
    openReport: "Open the report dialog (signed in)",
    openReportGuest: "Open the account wall (guest)",
    toasts: "Sonner is mounted by the root layout; these are the tones the app uses.",
    toastDefault: "Default toast",
    toastSuccess: "Success toast",
    toastError: "Error toast",
    toastMessage: "A short message, gone in a few seconds",
    wordHint: "Click a word for its gloss; the word under test is plain text.",
  },
} as const;
