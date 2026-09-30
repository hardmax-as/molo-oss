import { describe, expect, it } from "vitest";

import type { ExercisePayload } from "./index.ts";
import { applyModes, decideForModes } from "./modes.ts";

const U = "00000000-0000-4000-8000-000000000001";
const listen: ExercisePayload = {
  type: "listen_select",
  prompt: { lexemeId: U },
  options: [
    { lexemeId: U, correct: true },
    { lexemeId: U, correct: false },
  ],
};
const speak: ExercisePayload = { type: "speak", prompt: { lexemeId: U }, referenceAudioAssetId: U };
const drill: ExercisePayload = {
  type: "click_drill",
  set: "c",
  contrast: ["c", "x"],
  steps: ["listen_identify"],
  pairs: [],
  contrastWords: [{ lexemeId: U, click: "c" }],
};
const recordOnly: ExercisePayload = { ...drill, steps: ["record_compare"] };
const culture: ExercisePayload = {
  type: "culture_card",
  title: { en: "t", nb: "t" },
  body: { en: "b", nb: "b" },
  lexemeIds: [],
};

describe("modes", () => {
  it("keeps everything with both modes on", () => {
    for (const p of [listen, speak, drill, culture])
      expect(decideForModes(p, { listening: true, speaking: true })).toEqual({
        keep: true,
        quiet: false,
      });
  });

  it("listening off: listen exercises go quiet, drills and speak are skipped", () => {
    const m = { listening: false, speaking: true };
    expect(decideForModes(listen, m)).toEqual({ keep: true, quiet: true });
    expect(decideForModes(drill, m)).toEqual({ keep: false, reason: "listening" });
    expect(decideForModes(speak, m)).toEqual({ keep: false, reason: "listening" });
    expect(decideForModes(culture, m)).toEqual({ keep: true, quiet: false });
  });

  it("speaking off: speak skipped, record-only drills skipped, listening drills kept", () => {
    const m = { listening: true, speaking: false };
    expect(decideForModes(speak, m)).toEqual({ keep: false, reason: "speaking" });
    expect(decideForModes(recordOnly, m)).toEqual({ keep: false, reason: "speaking" });
    expect(decideForModes(drill, m)).toEqual({ keep: true, quiet: false });
  });

  it("applyModes counts what it dropped", () => {
    const r = applyModes(
      [listen, speak, drill, culture].map((payload, i) => ({ exercise: i, payload })),
      { listening: false, speaking: false },
    );
    expect(r.kept.map((k) => [k.exercise, k.quiet])).toEqual([
      [0, true],
      [3, false],
    ]);
    expect(r.skipped).toEqual({ listening: 1, speaking: 1 }); // speak is checked for speaking first
  });
});
