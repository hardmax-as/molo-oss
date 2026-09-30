import { describe, expect, it } from "vitest";

import type { ExercisePayload } from "./exercises/index.ts";
import {
  NO_HEARTS_LOST,
  RUN_HOT_AT,
  RUN_MIN_TO_SHOW,
  heartsLostBetween,
  heartsRunOut,
  lessonHeartsView,
  momentFor,
  mustConfirmExit,
  newWordIntroductions,
  newWordsFor,
  nextRun,
  playsOnTap,
  runHeat,
  runIsWorthSaying,
  tallyHeartAnswered,
  tallyHeartLost,
  taughtLexemeIds,
  unseenAmong,
  wordsToMeet,
} from "./lesson.ts";

const A = "00000000-0000-4000-8000-00000000aaaa";
const B = "00000000-0000-4000-8000-00000000bbbb";
const C = "00000000-0000-4000-8000-00000000cccc";
const S = "00000000-0000-4000-8000-0000000055ee";
const AUD = "00000000-0000-4000-8000-00000000d0d0";

describe("the run of right answers", () => {
  it("extends on a right answer and resets on a wrong one", () => {
    let run = 0;
    for (const correct of [true, true, true, true]) run = nextRun(run, correct);
    expect(run).toBe(4);
    run = nextRun(run, false);
    expect(run).toBe(0);
    expect(nextRun(run, true)).toBe(1);
  });

  it("stays quiet until it is worth saying", () => {
    for (let n = 0; n < RUN_MIN_TO_SHOW; n++) {
      expect(runIsWorthSaying(n), `run of ${n}`).toBe(false);
      expect(runHeat(n)).toBe("none");
    }
    expect(runIsWorthSaying(RUN_MIN_TO_SHOW)).toBe(true);
    expect(runHeat(RUN_MIN_TO_SHOW)).toBe("warm");
  });

  it("gets hot at seven", () => {
    expect(RUN_HOT_AT).toBe(7);
    expect(runHeat(RUN_HOT_AT - 1)).toBe("warm");
    expect(runHeat(RUN_HOT_AT)).toBe("hot");
    expect(runHeat(40)).toBe("hot");
  });
});

describe("which lexemes an exercise teaches", () => {
  const cases: ReadonlyArray<readonly [string, ExercisePayload, readonly string[]]> = [
    [
      "listen_select is about its prompt, not its distractors",
      {
        type: "listen_select",
        prompt: { lexemeId: A },
        options: [
          { lexemeId: A, correct: true },
          { lexemeId: B, correct: false },
        ],
      },
      [A],
    ],
    [
      "select_listen is about its prompt",
      {
        type: "select_listen",
        prompt: { lexemeId: B },
        options: [
          { lexemeId: A, correct: false },
          { lexemeId: B, correct: true },
        ],
      },
      [B],
    ],
    [
      "concord_fill is about the words in its blanks",
      {
        type: "concord_fill",
        sentenceId: S,
        blanks: [{ position: 1, lexemeId: C, form: "plural", distractors: [] }],
      },
      [C],
    ],
    [
      "class_sort is about every item",
      { type: "class_sort", buckets: ["5", "9"], items: [{ lexemeId: A }, { lexemeId: B }] },
      [A, B],
    ],
    [
      "match_pairs is about every pair",
      { type: "match_pairs", pairs: [{ lexemeId: A }, { lexemeId: C }] },
      [A, C],
    ],
    [
      "speak on a lexeme is about that lexeme",
      { type: "speak", prompt: { lexemeId: A }, referenceAudioAssetId: AUD },
      [A],
    ],
    [
      "speak on a sentence leaves the words to the sentence",
      { type: "speak", prompt: { sentenceId: S }, referenceAudioAssetId: AUD },
      [],
    ],
    [
      "translate_type leaves the words to the sentence",
      { type: "translate_type", sentenceId: S },
      [],
    ],
    [
      "translate_tap leaves the words to the sentence, distractors included",
      { type: "translate_tap", sentenceId: S, distractorLexemeIds: [B] },
      [],
    ],
    [
      "culture_card is about the words it names",
      {
        type: "culture_card",
        title: { en: "fixture title", nb: "fikstur-tittel" },
        body: { en: "fixture body", nb: "fikstur-tekst" },
        lexemeIds: [C],
      },
      [C],
    ],
  ];

  for (const [name, payload, expected] of cases) {
    it(name, () => {
      expect(taughtLexemeIds(payload)).toEqual(expected);
    });
  }
});

describe("the badge above the prompt", () => {
  const none = new Set<string>();

  it("says nothing for a word already met and never missed", () => {
    expect(momentFor({ teaches: [A], seen: new Set([A]), tricky: none })).toBeNull();
  });

  it("calls an unmet word new", () => {
    expect(momentFor({ teaches: [A], seen: none, tricky: none })).toBe("new_word");
    expect(momentFor({ teaches: [A, B], seen: new Set([A]), tricky: none })).toBe("new_word");
  });

  it("calls a missed word tricky, even when it is also new", () => {
    expect(momentFor({ teaches: [A], seen: new Set([A]), tricky: new Set([A]) })).toBe("tricky");
    expect(momentFor({ teaches: [A], seen: none, tricky: new Set([A]) })).toBe("tricky");
  });

  it("says nothing when the exercise teaches no word of its own", () => {
    expect(momentFor({ teaches: [], seen: none, tricky: new Set([A]) })).toBeNull();
  });
});

describe("the words a learner has not met", () => {
  it("keeps each unmet word once, in the order it is first taught", () => {
    expect(unseenAmong([B, A, B, C, A], new Set([C]))).toEqual([B, A]);
  });

  it("is empty once every word has been met", () => {
    expect(unseenAmong([A, B], new Set([A, B]))).toEqual([]);
  });

  it("asks the device for a guest and the server for an account", () => {
    // A guest's own history wins, whatever a cached payload says.
    expect([
      ...newWordsFor({ taught: [A, B], serverUnseen: [C], guestSeen: new Set([A]) }),
    ]).toEqual([B]);
    expect([...newWordsFor({ taught: [A, B], serverUnseen: [B], guestSeen: null })]).toEqual([B]);
  });

  it("introduces nothing when a server that predates the list says nothing", () => {
    expect(newWordsFor({ taught: [A, B], guestSeen: null }).size).toBe(0);
    expect(newWordsFor({ taught: [A, B], serverUnseen: null, guestSeen: null }).size).toBe(0);
  });
});

describe("meeting a new word before practising it", () => {
  const D = "00000000-0000-4000-8000-00000000dddd";
  const E = "00000000-0000-4000-8000-00000000eeee";
  const F = "00000000-0000-4000-8000-00000000ffff";
  const all = () => true;
  const plan = (
    exercises: ReadonlyArray<{ id: string; type: string; teaches?: readonly string[] }>,
    isNew: (id: string) => boolean = all,
    canShow: (id: string) => boolean = all,
  ) => Object.fromEntries(newWordIntroductions({ exercises, isNew, canShow }));

  it("puts one card in front of each match_pairs of unmet words, and none after (Unit 1, lesson 1)", () => {
    // The shape of greet-someone lesson 1 today: two match_pairs of three
    // words, two listen_selects on words the pairs already brought, and the
    // culture card.
    expect(
      plan([
        { id: "mp1", type: "match_pairs", teaches: [A, B, C] },
        { id: "mp2", type: "match_pairs", teaches: [D, E, F] },
        { id: "ls1", type: "listen_select", teaches: [A] },
        { id: "ls2", type: "listen_select", teaches: [E] },
        { id: "cc", type: "culture_card", teaches: [A, D] },
      ]),
    ).toEqual({ mp1: [A, B, C], mp2: [D, E, F] });
  });

  it("meets a word once, before the first exercise that asks for it", () => {
    expect(
      plan([
        { id: "one", type: "listen_select", teaches: [A] },
        { id: "two", type: "select_listen", teaches: [A] },
        { id: "three", type: "match_pairs", teaches: [A, B] },
      ]),
    ).toEqual({ one: [A], three: [B] });
  });

  it("never introduces a word the learner has already met", () => {
    expect(plan([{ id: "mp", type: "match_pairs", teaches: [A, B, C] }], (id) => id === B)).toEqual(
      { mp: [B] },
    );
    expect(plan([{ id: "ls", type: "listen_select", teaches: [A] }], () => false)).toEqual({});
  });

  it("puts no card in front of a click drill or a click identification, and waits for the meaning", () => {
    // The drill is about the sound. The word's meaning is met before the
    // first exercise that asks for it, not before the drill.
    expect(
      plan([
        { id: "id", type: "click_identify", teaches: [] },
        { id: "drill", type: "click_drill", teaches: [A, B] },
        { id: "ls", type: "listen_select", teaches: [A] },
      ]),
    ).toEqual({ ls: [A] });
  });

  it("lets a culture card present its own words", () => {
    expect(
      plan([
        { id: "cc", type: "culture_card", teaches: [A] },
        { id: "ls", type: "listen_select", teaches: [A] },
        { id: "sl", type: "select_listen", teaches: [B] },
      ]),
    ).toEqual({ sl: [B] });
  });

  it("introduces nothing in a lesson that is only a culture card", () => {
    expect(plan([{ id: "cc", type: "culture_card", teaches: [A, B] }])).toEqual({});
  });

  it("builds a card only from words the unit payload actually has", () => {
    expect(
      plan([{ id: "mp", type: "match_pairs", teaches: [A, B] }], all, (id) => id !== B),
    ).toEqual({ mp: [A] });
    expect(plan([{ id: "ls", type: "listen_select", teaches: [A] }], all, () => false)).toEqual({});
  });

  it("moves the card to the next exercise when the modes dropped the first", () => {
    // Speaking off drops the speak exercise; its word is met before the
    // exercise that does run.
    const lesson = [
      { id: "speak", type: "speak", teaches: [A] },
      { id: "ls", type: "listen_select", teaches: [A] },
    ];
    expect(plan(lesson)).toEqual({ speak: [A] });
    expect(plan(lesson.filter((e) => e.type !== "speak"))).toEqual({ ls: [A] });
  });

  it("gathers a sentence's unmet words onto one card", () => {
    expect(
      plan([
        { id: "tt", type: "translate_tap", teaches: [A, B, C] },
        { id: "cf", type: "concord_fill", teaches: [C, D] },
      ]),
    ).toEqual({ tt: [A, B, C], cf: [D] });
  });

  it("never shows the same card twice, however often the plan is recomputed", () => {
    const p = newWordIntroductions({
      exercises: [{ id: "mp", type: "match_pairs", teaches: [A, B] }],
      isNew: all,
      canShow: all,
    });
    expect(wordsToMeet(p, "mp", new Set())).toEqual([A, B]);
    expect(wordsToMeet(p, "mp", new Set([A]))).toEqual([B]);
    expect(wordsToMeet(p, "mp", new Set([A, B]))).toEqual([]);
    expect(wordsToMeet(p, "elsewhere", new Set())).toEqual([]);
  });
});

describe("tapping a match-pairs tile", () => {
  it("plays the isiXhosa word, as Duolingo plays a target-language tile", () => {
    expect(playsOnTap({ side: "xh", listening: true, hasClip: true })).toBe(true);
  });

  it("never plays a meaning, with listening off, or a word with no recording", () => {
    expect(playsOnTap({ side: "gloss", listening: true, hasClip: true })).toBe(false);
    expect(playsOnTap({ side: "xh", listening: false, hasClip: true })).toBe(false);
    expect(playsOnTap({ side: "xh", listening: true, hasClip: false })).toBe(false);
  });
});

describe("hearts in the lesson header", () => {
  const five = { hearts: 5, max: 5, unlimited: false };

  it("shows nothing for a guest, infinity for Plus and the count otherwise", () => {
    expect(lessonHeartsView(null)).toEqual({ kind: "none" });
    expect(lessonHeartsView(undefined)).toEqual({ kind: "none" });
    expect(lessonHeartsView({ ...five, unlimited: true })).toEqual({ kind: "unlimited" });
    // A purchase the store knows about before the server's webhook does.
    expect(lessonHeartsView(five, NO_HEARTS_LOST, true)).toEqual({ kind: "unlimited" });
    expect(lessonHeartsView({ ...five, hearts: 3 })).toEqual({ kind: "count", hearts: 3, max: 5 });
  });

  it("breaks a heart at once, before the server has answered", () => {
    const tally = tallyHeartLost(NO_HEARTS_LOST, five);
    expect(lessonHeartsView(five, tally)).toEqual({ kind: "count", hearts: 4, max: 5 });
  });

  it("does not count a loss twice, whichever of answer and refreshed state lands first", () => {
    const four = { ...five, hearts: 4 };
    const lost = tallyHeartLost(NO_HEARTS_LOST, five);
    // The refreshed state first, the answer after it.
    expect(lessonHeartsView(four, lost)).toMatchObject({ hearts: 4 });
    // The answer first, while the screen still holds the old state.
    const answered = tallyHeartAnswered(lost, four);
    expect(lessonHeartsView(five, answered)).toMatchObject({ hearts: 4 });
    expect(lessonHeartsView(four, answered)).toMatchObject({ hearts: 4 });
    // And the next loss counts from the server's answer.
    expect(lessonHeartsView(four, tallyHeartLost(answered, four))).toMatchObject({ hearts: 3 });
  });

  it("trusts the server's answer over a stale count", () => {
    // The state on screen said one heart; a heart had regenerated since, so
    // the server takes the loss from two. The lesson must not stay paused.
    const one = { ...five, hearts: 1 };
    const lost = tallyHeartLost(NO_HEARTS_LOST, one);
    expect(heartsRunOut(lessonHeartsView(one, lost))).toBe(true);
    const answered = tallyHeartAnswered(lost, one);
    expect(lessonHeartsView(one, answered)).toMatchObject({ hearts: 1 });
    expect(heartsRunOut(lessonHeartsView(one, answered))).toBe(false);
  });

  it("keeps a heart lost offline lost, and never shows more than the server says", () => {
    const offline = tallyHeartAnswered(tallyHeartLost(NO_HEARTS_LOST, five), null);
    expect(lessonHeartsView(five, offline)).toMatchObject({ hearts: 4 });
    // The next loss reaches the server, which only ever heard of that one.
    const both = tallyHeartAnswered(tallyHeartLost(offline, five), { ...five, hearts: 4 });
    expect(lessonHeartsView({ ...five, hearts: 4 }, both)).toMatchObject({ hearts: 3 });
    // Another device spent hearts meanwhile: the server's lower count wins.
    expect(lessonHeartsView({ ...five, hearts: 2 }, offline)).toMatchObject({ hearts: 2 });
    expect(lessonHeartsView({ ...five, hearts: 1 }, { anchor: 1, pending: 4 })).toMatchObject({
      hearts: 0,
    });
  });

  it("counts nothing for a guest or for Plus", () => {
    expect(tallyHeartLost(NO_HEARTS_LOST, null)).toBe(NO_HEARTS_LOST);
    expect(tallyHeartLost(NO_HEARTS_LOST, { ...five, unlimited: true })).toBe(NO_HEARTS_LOST);
    expect(tallyHeartLost(NO_HEARTS_LOST, five, true)).toBe(NO_HEARTS_LOST);
    // Plus arrived while the answer was in flight.
    const lost = tallyHeartLost(NO_HEARTS_LOST, five);
    expect(tallyHeartAnswered(lost, { ...five, unlimited: true })).toBe(NO_HEARTS_LOST);
  });

  it("says how many hearts went, which is what starts the animation", () => {
    const count = (hearts: number) => ({ kind: "count" as const, hearts, max: 5 });
    expect(heartsLostBetween(count(5), count(4))).toBe(1);
    expect(heartsLostBetween(count(4), count(4))).toBe(0);
    // A heart coming back is not a loss.
    expect(heartsLostBetween(count(3), count(4))).toBe(0);
    expect(heartsLostBetween({ kind: "none" }, count(4))).toBe(0);
    expect(heartsLostBetween(count(5), { kind: "unlimited" })).toBe(0);
  });

  it("runs out at zero counted hearts, never for Plus or a guest", () => {
    expect(heartsRunOut({ kind: "count", hearts: 0, max: 5 })).toBe(true);
    expect(heartsRunOut({ kind: "count", hearts: 1, max: 5 })).toBe(false);
    expect(heartsRunOut({ kind: "unlimited" })).toBe(false);
    expect(heartsRunOut({ kind: "none" })).toBe(false);
  });
});

describe("leaving a lesson halfway", () => {
  it("asks once an exercise is done, until the lesson is over or paused", () => {
    expect(mustConfirmExit({ done: 0, finished: false })).toBe(false);
    expect(mustConfirmExit({ done: 1, finished: false })).toBe(true);
    expect(mustConfirmExit({ done: 4, finished: true })).toBe(false);
    expect(mustConfirmExit({ done: 2, finished: false, paused: true })).toBe(false);
  });
});
