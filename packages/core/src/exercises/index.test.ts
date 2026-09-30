import { Either } from "effect";
import { describe, expect, it } from "vitest";

import { decodeExercisePayload, decodePayloadForType, referencedIds } from "./index.ts";

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("exercise payloads", () => {
  it("decodes a listen_select with exactly one correct option", () => {
    const r = decodeExercisePayload({
      type: "listen_select",
      prompt: { lexemeId: u(1) },
      options: [
        { lexemeId: u(1), correct: true },
        { lexemeId: u(2), correct: false },
      ],
    });
    expect(Either.isRight(r)).toBe(true);
  });

  it("rejects two correct options and unknown types", () => {
    const two = decodeExercisePayload({
      type: "listen_select",
      prompt: { lexemeId: u(1) },
      options: [
        { lexemeId: u(1), correct: true },
        { lexemeId: u(2), correct: true },
      ],
    });
    expect(Either.isLeft(two)).toBe(true);
    expect(Either.isLeft(decodeExercisePayload({ type: "lecture", body: "x" }))).toBe(true);
  });

  it("refuses a payload whose type disagrees with the row type", () => {
    const r = decodePayloadForType("match_pairs", { type: "translate_type", sentenceId: u(9) });
    expect(Either.isLeft(r)).toBe(true);
  });

  it("collects every referenced id for the publish-gate walk", () => {
    const r = decodeExercisePayload({
      type: "click_drill",
      set: "A",
      contrast: ["c", "x", "q"],
      speakerId: u(50),
      steps: ["listen_identify"],
      pairs: [
        {
          a: { lexemeId: u(1), click: "c", audioAssetId: u(11) },
          b: { lexemeId: u(2), click: "x", audioAssetId: u(12) },
          audioSlowAssetId: u(13),
        },
      ],
      contrastWords: [{ lexemeId: u(3), click: "q", audioAssetId: u(14) }],
    });
    expect(Either.isRight(r)).toBe(true);
    if (Either.isRight(r)) {
      const ids = referencedIds(r.right);
      expect(ids.lexemeIds).toEqual([u(1), u(2), u(3)]);
      expect(ids.audioAssetIds).toEqual([u(11), u(12), u(13), u(14)]);
      expect(ids.speakerIds).toEqual([u(50)]);
    }
  });

  it("rejects a drill with neither pairs nor contrast words", () => {
    const r = decodeExercisePayload({
      type: "click_drill",
      set: "A",
      contrast: ["c", "x"],
      speakerId: u(50),
      steps: ["listen_identify"],
      pairs: [],
      contrastWords: [],
    });
    expect(Either.isLeft(r)).toBe(true);
  });
});
