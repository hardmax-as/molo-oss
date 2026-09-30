import { describe, expect, it } from "vitest";

import type { ExercisePayload } from "./index.ts";
import {
  distinctByLabel,
  optionCollisions,
  optionLabelKey,
  optionLexemeIds,
  type OptionLabels,
} from "./option-labels.ts";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
// Fixture lemmas are placeholders, not isiXhosa.
const labels: Record<string, OptionLabels> = {
  [id(1)]: { lemma: "zz-a", glosses: { en: "hello", nb: "hei" } },
  [id(2)]: { lemma: "zz-b", glosses: { en: "thank you", nb: "takk" } },
  [id(3)]: { lemma: "zz-c", glosses: { en: "Hello!", nb: "hallo" } },
  [id(4)]: { lemma: "ZZ-A", glosses: { en: "goodbye", nb: null } },
};
const of = (lexemeId: string) => labels[lexemeId];

const listen = (...ids: string[]): ExercisePayload => ({
  type: "listen_select",
  prompt: { lexemeId: ids[0]! },
  options: ids.map((lexemeId, i) => ({ lexemeId, correct: i === 0 })),
});

describe("option collisions (audit M02)", () => {
  it("normalises case, punctuation, spacing and diacritics", () => {
    expect(optionLabelKey("  Hello! ")).toBe("hello");
    expect(optionLabelKey("á  b")).toBe("a b");
  });

  it("finds two options that read the same in one source language", () => {
    const c = optionCollisions(listen(id(2), id(1), id(3)), of);
    expect(c).toEqual([{ field: "en", label: "hello", lexemeIds: [id(1), id(3)] }]);
  });

  it("finds two options with the same lemma", () => {
    const c = optionCollisions(listen(id(1), id(4)), of);
    expect(c.map((x) => x.field)).toEqual(["xh"]);
  });

  it("passes distinct options and ignores missing glosses", () => {
    expect(optionCollisions(listen(id(1), id(2)), of)).toEqual([]);
    expect(optionCollisions(listen(id(2), id(4)), of)).toEqual([]);
  });

  it("covers select_listen and match_pairs, not other types", () => {
    const pairs: ExercisePayload = {
      type: "match_pairs",
      pairs: [{ lexemeId: id(1) }, { lexemeId: id(3) }],
    };
    expect(optionCollisions(pairs, of)).toHaveLength(1);
    expect(
      optionLexemeIds({ type: "translate_type", sentenceId: id(1) } as ExercisePayload),
    ).toEqual([]);
  });

  it("a client keeps the correct option and drops the colliding distractor", () => {
    const opts = [
      { lexemeId: id(3), correct: false },
      { lexemeId: id(2), correct: false },
      { lexemeId: id(1), correct: true },
    ];
    const kept = distinctByLabel(
      opts,
      (o) => [
        ["xh", of(o.lexemeId)?.lemma],
        ["en", of(o.lexemeId)?.glosses["en"]],
      ],
      (o) => o.correct,
    );
    expect(kept.map((o) => o.lexemeId)).toEqual([id(2), id(1)]);
  });

  it("does not confuse a lemma with a gloss that happens to match it", () => {
    const items = [
      { lemma: "same", gloss: "x1" },
      { lemma: "y1", gloss: "same" },
    ];
    expect(
      distinctByLabel(items, (i) => [
        ["xh", i.lemma],
        ["en", i.gloss],
      ]),
    ).toHaveLength(2);
  });
});
