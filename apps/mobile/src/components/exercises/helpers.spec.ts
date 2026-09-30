import {
  clickChoices,
  clickRounds,
  clickRuns,
  clicksIn,
  distinctOptions,
  distinctPairIds,
  filterExercises,
  resolveBlanks,
  sameTile,
  seedOf,
  shuffle,
} from "./helpers";

describe("options that read the same (audit M02)", () => {
  // The audit's case: the prompt offers "thank you", "hello", "hello". Lemmas are placeholders.
  const labels: Record<string, { lemma: string; gloss: string | null }> = {
    thanks: { lemma: "zz-thanks", gloss: "thank you" },
    hello1: { lemma: "zz-hello-1", gloss: "hello" },
    hello2: { lemma: "zz-hello-2", gloss: "Hello!" },
    same: { lemma: "ZZ-HELLO-1", gloss: "goodbye" },
  };
  const labelOf = (id: string) => labels[id] ?? null;

  it("drops the distractor that reads like the answer, never the answer", () => {
    const options = [
      { lexemeId: "thanks", correct: false },
      { lexemeId: "hello2", correct: false },
      { lexemeId: "hello1", correct: true },
    ];
    expect(distinctOptions(options, labelOf).map((o) => o.lexemeId)).toEqual(["thanks", "hello1"]);
  });

  it("drops a second word with the same spelling", () => {
    const options = [
      { lexemeId: "hello1", correct: true },
      { lexemeId: "same", correct: false },
    ];
    expect(distinctOptions(options, labelOf)).toHaveLength(1);
  });

  it("match pairs keeps one row per word and per meaning", () => {
    expect(distinctPairIds(["hello1", "thanks", "hello2"], labelOf)).toEqual(["hello1", "thanks"]);
  });

  it("scores a tile that reads like the right one as right", () => {
    expect(sameTile("hello2", "hello1", labelOf, "gloss")).toBe(true);
    expect(sameTile("thanks", "hello1", labelOf, "gloss")).toBe(false);
    expect(sameTile("same", "hello1", labelOf, "lemma")).toBe(true);
    expect(sameTile(null, "hello1", labelOf, "gloss")).toBe(false);
    expect(sameTile("unknown", "hello1", labelOf, "gloss")).toBe(false);
  });
});

describe("click colouring", () => {
  it("splits a word into runs by click letter", () => {
    expect(clickRuns("ukuxhala")).toEqual([
      { text: "uku", click: null },
      { text: "x", click: "x" },
      { text: "hala", click: null },
    ]);
    expect(clickRuns("Cwaka")).toEqual([
      { text: "C", click: "c" },
      { text: "waka", click: null },
    ]);
  });
  it("lists the click letters once, in order", () => {
    expect(clicksIn("ngcwele qha xa")).toEqual(["c", "q", "x"]);
    expect(clicksIn("molo")).toEqual([]);
  });
});

describe("shuffle", () => {
  it("is deterministic for a seed and keeps every item", () => {
    const a = shuffle([1, 2, 3, 4, 5], seedOf("x"));
    expect(shuffle([1, 2, 3, 4, 5], seedOf("x"))).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("resolveBlanks", () => {
  const tokens = [
    { position: 0, surfaceForm: "Inja" },
    { position: 1, surfaceForm: "iyaphila" },
  ];
  it("takes the answer from the token at the blank's position and dedupes distractors", () => {
    const blanks = resolveBlanks(
      "s1",
      [{ position: 1, distractors: ["ziyaphila", "iyaphila", "uyaphila"] }],
      tokens,
    );
    expect(blanks).toHaveLength(1);
    expect(blanks[0]?.answer).toBe("iyaphila");
    expect([...(blanks[0]?.options ?? [])].sort()).toEqual(["iyaphila", "uyaphila", "ziyaphila"]);
  });
  it("drops a blank whose position has no token", () => {
    expect(resolveBlanks("s1", [{ position: 9, distractors: [] }], tokens)).toEqual([]);
  });
});

describe("filterExercises", () => {
  const all = [
    { type: "culture_card" },
    { type: "listen_select" },
    { type: "click_drill" },
    { type: "click_identify" },
    { type: "speak" },
    { type: "translate_tap" },
  ];
  it("keeps everything when both modes are on", () => {
    expect(filterExercises(all, { listening: true, speaking: true })).toHaveLength(6);
  });
  it("drops click drills without listening and speak without speaking", () => {
    expect(filterExercises(all, { listening: false, speaking: true }).map((e) => e.type)).toEqual([
      "culture_card",
      "listen_select",
      "speak",
      "translate_tap",
    ]);
    expect(filterExercises(all, { listening: true, speaking: false }).map((e) => e.type)).toEqual([
      "culture_card",
      "listen_select",
      "click_drill",
      "click_identify",
      "translate_tap",
    ]);
  });
});

describe("click_identify rounds", () => {
  const c = "f2c23dae-88c2-460c-bb4b-7b3adcec05fc";
  const x = "6dc06cfc-cbf4-431a-971e-480d53d3a472";
  const q = "99ced0d3-1c90-4457-b05f-d98ef450ee1f";
  it("offers every listed click as a tile and drops unknown ids", () => {
    expect(clickChoices([c, x, "nope", q]).map((s) => s.letter)).toEqual(["c", "x", "q"]);
  });
  it("plays only the recorded clicks, once each, in a stable order", () => {
    const audio = { [c]: {}, [q]: {} };
    const a = clickRounds("A", [c, x, q], audio).map((s) => s.letter);
    expect([...a].sort()).toEqual(["c", "q"]);
    expect(clickRounds("A", [c, x, q], audio).map((s) => s.letter)).toEqual(a);
    expect(clickRounds("A", [c, x, q], undefined)).toEqual([]);
  });
});
