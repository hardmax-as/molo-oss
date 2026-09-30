import { Either } from "effect";
import { describe, expect, it } from "vitest";

import {
  CLICK_IDENTIFY_SETS,
  CLICK_IDENTIFY_SET_NAMES,
  CLICK_SOUNDS,
  clickIdsForSet,
  clicksMissingAudio,
  clickSoundById,
  isClickIdentifySet,
} from "../click-sounds.ts";
import { taughtLexemeIds } from "../lesson.ts";
import { lessonKindOf } from "../path.ts";
import { graphPublishGate } from "../publish-gate.ts";
import {
  decodePayloadForType,
  mistakeLexemeId,
  referencedClickIds,
  referencedIds,
  type ExercisePayload,
} from "./index.ts";
import { decideForModes } from "./modes.ts";

const setA = clickIdsForSet("A");

describe("click_identify sets", () => {
  it("names only real click letters, with no repeats inside a set", () => {
    for (const name of CLICK_IDENTIFY_SET_NAMES) {
      const letters = CLICK_IDENTIFY_SETS[name];
      expect(new Set(letters).size).toBe(letters.length);
      expect(clickIdsForSet(name)).toHaveLength(letters.length);
    }
  });

  it("puts c, x, q first and plain against aspirated second", () => {
    expect(setA.map((id) => clickSoundById(id)?.letter)).toEqual(["c", "x", "q"]);
    expect(clickIdsForSet("B").map((id) => clickSoundById(id)?.letter)).toEqual([
      "c",
      "ch",
      "x",
      "xh",
      "q",
      "qh",
    ]);
  });

  it("recognises set names and nothing else", () => {
    expect(isClickIdentifySet("A")).toBe(true);
    expect(isClickIdentifySet("toString")).toBe(false);
    expect(isClickIdentifySet("Z")).toBe(false);
  });
});

describe("click_identify payload", () => {
  it("decodes a set of bare clicks", () => {
    const r = decodePayloadForType("click_identify", {
      type: "click_identify",
      set: "A",
      clicks: setA,
    });
    expect(Either.isRight(r)).toBe(true);
  });

  it("refuses an id that is not a CLICK_SOUNDS click, a repeat, or a single click", () => {
    const bad = (clicks: string[]) =>
      Either.isLeft(
        decodePayloadForType("click_identify", { type: "click_identify", set: "A", clicks }),
      );
    expect(bad([setA[0]!, "00000000-0000-4000-8000-000000000001"])).toBe(true);
    expect(bad([setA[0]!, setA[0]!])).toBe(true);
    expect(bad([setA[0]!])).toBe(true);
    expect(bad(CLICK_SOUNDS.slice(0, 7).map((c) => c.id))).toBe(true);
  });

  it("references clicks, never a lexeme, and teaches no word", () => {
    const p: ExercisePayload = { type: "click_identify", set: "A", clicks: setA };
    expect(referencedClickIds(p)).toEqual(setA);
    expect(referencedIds(p)).toEqual({
      lexemeIds: [],
      sentenceIds: [],
      audioAssetIds: [],
      speakerIds: [],
    });
    expect(taughtLexemeIds(p)).toEqual([]);
    expect(mistakeLexemeId(p)).toBeNull();
  });

  it("needs ears: skipped with listening off, and a listening lesson", () => {
    const p: ExercisePayload = { type: "click_identify", set: "A", clicks: setA };
    expect(decideForModes(p, { listening: false, speaking: true })).toEqual({
      keep: false,
      reason: "listening",
    });
    expect(decideForModes(p, { listening: true, speaking: false })).toEqual({
      keep: true,
      quiet: false,
    });
    expect(lessonKindOf({ types: ["click_identify", "click_identify"] })).toBe("listen");
  });
});

describe("click_identify gate", () => {
  const editor = { id: "e2", roles: ["editor" as const] };

  it("lists every click with no published tier-1 take", () => {
    expect(clicksMissingAudio(setA, new Set([setA[0]!]))).toEqual([setA[1], setA[2]]);
    expect(clicksMissingAudio(setA, new Set(setA))).toEqual([]);
  });

  it("fails once per missing click and passes when all are recorded", () => {
    const failing = graphPublishGate({
      createdBy: "e1",
      approver: editor,
      references: [],
      clicksMissingAudio: ["x", "q"],
    });
    expect(failing.ok).toBe(false);
    expect(failing.failures).toEqual([
      { code: "click_audio_missing", detail: "x" },
      { code: "click_audio_missing", detail: "q" },
    ]);
    const passing = graphPublishGate({
      createdBy: "e1",
      approver: editor,
      references: [],
      clicksMissingAudio: [],
    });
    expect(passing.ok).toBe(true);
  });
});
