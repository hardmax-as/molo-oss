import { describe, expect, it } from "vitest";

import type { PathResponse, UnitResponse } from "./api.ts";
import type { AudioRef } from "./audio.ts";
import { buildPath, type PathUnitInput } from "./path.ts";
import {
  exerciseAudioUrls,
  lessonAudioUrls,
  nextLessonInPath,
  nextLessonOf,
  nextUnitForGuest,
  unitAudioUrls,
} from "./prefetch.ts";

const ref = (url: string): AudioRef => ({
  id: url,
  url,
  tier: "1_native_studio",
  durationMs: 900,
  attribution: null,
  speaker: null,
});

function lexeme(id: string, url: string | null, voices: string[] = []) {
  return {
    id,
    lemma: id,
    pos: "noun",
    nounClass: null,
    isPlural: false,
    infinitive: null,
    register: "neutral",
    gloss: null,
    audio: url ? ref(url) : null,
    voices: voices.map(ref),
  } as unknown as UnitResponse["lexemes"][string];
}

function exercise(id: string, payload: unknown) {
  return { id, order: 0, type: "listen_select", payload, teaches: [], moment: null } as never;
}

/** One unit, two lessons; lesson one's exercises reference words, a sentence, an asset and clicks. */
function unit(): UnitResponse {
  return {
    unit: {
      id: "u1",
      slug: "greetings",
      titleKey: "t",
      order: 1,
      cefrBand: "A1",
      prerequisiteUnitId: null,
      lessonCount: 2,
      locked: false,
      prerequisiteSlug: null,
      prerequisiteTitleKey: null,
      skills: [
        {
          id: "s1",
          slug: "hello",
          titleKey: "s",
          order: 1,
          kind: "vocab",
          grammarNotes: [],
          lessons: [
            {
              id: "l1",
              order: 1,
              estimatedMinutes: 3,
              exercises: [
                exercise("e1", {
                  prompt: { lexemeId: "molo" },
                  options: [
                    { lexemeId: "molo", correct: true },
                    { lexemeId: "enkosi", correct: false },
                  ],
                }),
                exercise("e2", { sentenceId: "sent1", tiles: ["not-an-id"] }),
                exercise("e3", { prompt: { lexemeId: "enkosi" }, referenceAudioAssetId: "a1" }),
                exercise("e4", { set: "c", clicks: ["c", "x"] }),
              ],
            },
          ],
        },
        {
          id: "s2",
          slug: "thanks",
          titleKey: "s2",
          order: 2,
          kind: "vocab",
          grammarNotes: [],
          lessons: [
            {
              id: "l2",
              order: 1,
              estimatedMinutes: 3,
              exercises: [
                exercise("e5", { pairs: [{ lexemeId: "silent" }, { lexemeId: "molo" }] }),
              ],
            },
          ],
        },
      ],
    },
    sourceLang: "en",
    lexemes: {
      molo: lexeme("molo", "https://api/audio/molo.opus", ["https://api/audio/molo-2.opus"]),
      enkosi: lexeme("enkosi", "https://api/audio/enkosi.opus"),
      silent: lexeme("silent", null),
    },
    sentences: {
      sent1: {
        id: "sent1",
        textXh: "Molo",
        gloss: null,
        tokens: [],
        audio: ref("https://api/audio/sent1.opus"),
        voices: [],
      },
    },
    audioAssets: { a1: ref("https://api/audio/a1.opus") },
    clickAudio: {
      c: ref("https://api/audio/click-c.opus"),
      x: ref("https://api/audio/click-x.opus"),
    },
  } as unknown as UnitResponse;
}

describe("exerciseAudioUrls", () => {
  it("finds the chosen voice of every word, sentence, asset and click the payload names, once each", () => {
    const u = unit();
    const [e1, e2, e3, e4] = u.unit.skills[0]!.lessons[0]!.exercises;
    expect(exerciseAudioUrls(e1!, u)).toEqual([
      "https://api/audio/molo.opus",
      "https://api/audio/enkosi.opus",
    ]);
    expect(exerciseAudioUrls(e2!, u)).toEqual(["https://api/audio/sent1.opus"]);
    expect(exerciseAudioUrls(e3!, u)).toEqual([
      "https://api/audio/enkosi.opus",
      "https://api/audio/a1.opus",
    ]);
    expect(exerciseAudioUrls(e4!, u)).toEqual([
      "https://api/audio/click-c.opus",
      "https://api/audio/click-x.opus",
    ]);
  });

  it("never warms an alternative voice, a word with no recording, or a prototype key", () => {
    const u = unit();
    const urls = exerciseAudioUrls({ payload: ["molo", "silent", "constructor", "toString"] }, u);
    expect(urls).toEqual(["https://api/audio/molo.opus"]);
  });

  it("stops on a payload nested deeper than any real exercise", () => {
    let deep: unknown = "molo";
    for (let i = 0; i < 20; i++) deep = { next: deep };
    expect(exerciseAudioUrls({ payload: deep }, unit())).toEqual([]);
  });
});

describe("lessonAudioUrls", () => {
  it("takes the next few exercises from where the learner is, deduplicated", () => {
    const u = unit();
    expect(lessonAudioUrls(u, "l1", 0, 2)).toEqual([
      "https://api/audio/molo.opus",
      "https://api/audio/enkosi.opus",
      "https://api/audio/sent1.opus",
    ]);
    expect(lessonAudioUrls(u, "l1", 2, 3)).toEqual([
      "https://api/audio/enkosi.opus",
      "https://api/audio/a1.opus",
      "https://api/audio/click-c.opus",
      "https://api/audio/click-x.opus",
    ]);
  });

  it("is empty for a lesson the unit does not hold, or past the end", () => {
    expect(lessonAudioUrls(unit(), "nope")).toEqual([]);
    expect(lessonAudioUrls(unit(), "l1", 10, 3)).toEqual([]);
  });
});

describe("unitAudioUrls", () => {
  it("is every recording the unit's lessons play, lesson by lesson, each once", () => {
    expect(unitAudioUrls(unit())).toEqual([
      "https://api/audio/molo.opus",
      "https://api/audio/enkosi.opus",
      "https://api/audio/sent1.opus",
      "https://api/audio/a1.opus",
      "https://api/audio/click-c.opus",
      "https://api/audio/click-x.opus",
    ]);
  });
});

function pathUnit(
  id: string,
  slug: string,
  locked: boolean,
  crowns: number[],
): PathResponse["units"][number] {
  return {
    id,
    slug,
    titleKey: slug,
    order: 1,
    cefrBand: "A1",
    prerequisiteUnitId: null,
    lessonCount: crowns.length,
    locked,
    prerequisiteSlug: null,
    prerequisiteTitleKey: null,
    skills: [
      {
        id: `${id}-s`,
        slug: `${slug}-s`,
        titleKey: "s",
        order: 1,
        kind: "vocab",
        chestClaimed: false,
        lessons: crowns.map((crownLevel, i) => ({
          id: `${id}-l${i + 1}`,
          order: i + 1,
          estimatedMinutes: 3,
          exerciseCount: 5,
          kind: "mixed",
          crownLevel,
        })),
      },
    ],
  } as unknown as PathResponse["units"][number];
}

describe("nextLessonInPath", () => {
  it("is the first unfinished lesson of the first open unit", () => {
    const path = {
      units: [pathUnit("u1", "one", false, [1, 1]), pathUnit("u2", "two", false, [1, 0, 0])],
    };
    expect(nextLessonInPath(path)).toEqual({ unitSlug: "two", lessonId: "u2-l2" });
  });

  it("skips a locked unit, and is null when nothing is left to do", () => {
    expect(nextLessonInPath({ units: [pathUnit("u1", "one", true, [0])] })).toBeNull();
    expect(nextLessonInPath({ units: [pathUnit("u1", "one", false, [2, 1])] })).toBeNull();
  });

  it("agrees with the node buildPath marks current", () => {
    const units = [pathUnit("u1", "one", false, [1, 0]), pathUnit("u2", "two", true, [0])];
    const rows = buildPath(units as unknown as PathUnitInput[], { chestXp: 10 });
    expect(nextLessonOf(rows)).toEqual(nextLessonInPath({ units }));
    expect(nextLessonOf(rows)).toEqual({ unitSlug: "one", lessonId: "u1-l2" });
  });
});

describe("nextUnitForGuest", () => {
  const units = [
    { id: "u1", slug: "one", lessonCount: 2, prerequisiteUnitId: null },
    { id: "u2", slug: "two", lessonCount: 1, prerequisiteUnitId: "u1" },
  ];

  it("is the first unit the guest may open and has not finished", () => {
    expect(nextUnitForGuest(units, [])).toBe("one");
    expect(nextUnitForGuest(units, [{ unitSlug: "one", lessonId: "a" }])).toBe("one");
    expect(
      nextUnitForGuest(units, [
        { unitSlug: "one", lessonId: "a" },
        { unitSlug: "one", lessonId: "b" },
      ]),
    ).toBe("two");
  });

  it("is null once everything open is finished", () => {
    const all = [
      { unitSlug: "one", lessonId: "a" },
      { unitSlug: "one", lessonId: "b" },
      { unitSlug: "two", lessonId: "c" },
    ];
    expect(nextUnitForGuest(units, all)).toBeNull();
  });
});
