import { GOLDEN_FRAME_SENTENCE, goldenPullSkip, type GoldenCase } from "@molo/core";
import { describe, expect, it } from "vitest";

import {
  concordFromMark,
  frameFor,
  frameNoun,
  framesEnabled,
  GOLDEN_FRAMES_LIVE,
  noteWithSentence,
  sentenceFromNote,
} from "./golden-frames.ts";

const card = (patch: Partial<GoldenCase>): GoldenCase => ({
  lemma: "zz-noun",
  class: "3",
  form: "subject_concord",
  expected: "",
  validated_by: "",
  validated_on: "",
  irregular: false,
  note: "fixture words.csv:word_id=1; gloss: tree; wood. Selection: fixture.",
  ...patch,
});

describe("sentence frames", () => {
  it("are off for an editor until the operator's switch; an admin may preview", () => {
    expect(GOLDEN_FRAMES_LIVE).toBe(false);
    expect(framesEnabled(false, false)).toBe(false);
    expect(framesEnabled(false, true)).toBe(false);
    expect(framesEnabled(true, false)).toBe(false);
    expect(framesEnabled(true, true)).toBe(true);
    expect(framesEnabled(false, false, true)).toBe(true);
  });

  it("build an English frame from the lexicon's first gloss, is or are by class", () => {
    expect(frameNoun(card({}))).toBe("tree");
    expect(frameFor(card({}))).toEqual({
      key: "edit.goldens.frames.sentence.subject_concord.singular",
      noun: "tree",
    });
    expect(frameFor(card({ class: "4", note: "gloss: trees." }))?.key).toBe(
      "edit.goldens.frames.sentence.subject_concord.plural",
    );
    expect(frameFor(card({ form: "plural" }))).toBeNull();
    expect(frameFor(card({ note: "no gloss here" }))).toBeNull();
  });

  it("name the language, not the people, for isiXhosa", () => {
    // The lexicon's first gloss is "Xhosa", which reads as the people (class 2).
    expect(frameNoun(card({ lemma: "isiXhosa", class: "7", note: "gloss: Xhosa." }))).toBe(
      "Xhosa language",
    );
  });

  it("give the possessive frame another owner when the noun is the child itself", () => {
    const child = card({ form: "possessive", class: "1", note: "gloss: child." });
    expect(frameFor(child)?.key).toBe("edit.goldens.frames.sentence.possessive.otherOwner");
    expect(frameFor({ ...child, note: "gloss: tree." })?.key).toBe(
      "edit.goldens.frames.sentence.possessive.singular",
    );
    // Only the possessive has an owner.
    expect(frameFor({ ...child, form: "object_concord" })?.key).toBe(
      "edit.goldens.frames.sentence.object_concord.singular",
    );
  });

  it("write the marked part the way the golden file writes a concord, adding only hyphens", () => {
    expect(concordFromMark("subject_concord", " zz ")).toBe("zz-");
    expect(concordFromMark("possessive", "zz-")).toBe("zz-");
    expect(concordFromMark("object_concord", "-zz")).toBe("-zz-");
    expect(concordFromMark("subject_concord", "  ")).toBe("");
    // Across a space is a slip, not a concord.
    expect(concordFromMark("subject_concord", "zz yy")).toBe("");
  });

  it("keep her sentence in the note, replacing an earlier one, and read it back", () => {
    const once = noteWithSentence("source note", "zz one", "zz");
    expect(once).toBe("Sentence: zz one (agreement: zz)\nsource note");
    const twice = noteWithSentence(once, "zz two", "z");
    expect(twice).toBe("Sentence: zz two (agreement: z)\nsource note");
    expect(sentenceFromNote(twice)).toBe("zz two");
    expect(sentenceFromNote("source note")).toBe("");
  });

  it("write a note that goldens pull takes as a frame answer", () => {
    const note = noteWithSentence("source note", "zz one", "zz");
    expect(GOLDEN_FRAME_SENTENCE.test(note)).toBe(true);
    expect(goldenPullSkip(card({}), note)).toBeNull();
    expect(goldenPullSkip(card({}), "source note")).toBe("concord_before_frames");
  });
});
