import {
  correctionNoteFor,
  parseSeenNotes,
  pickGrammarNote,
  SEEN_NOTES_LIMIT,
  withNoteSeen,
  type ParadigmCell,
} from "@molo/core/grammar-rules";

import { paradigmRowLabel } from "./paradigm-label.ts";

const note = (id: string, order: number) => ({ id, order });

describe("which grammar note stops the learner", () => {
  const notes = [note("b", 2), note("a", 1)];

  it("shows the first unseen rule at the start of a lesson", () => {
    expect(pickGrammarNote({ notes, seen: [], atStart: true })?.id).toBe("a");
  });

  it("moves on to the next rule once the first is dismissed", () => {
    expect(pickGrammarNote({ notes, seen: ["a"], atStart: true })?.id).toBe("b");
  });

  it("stops interrupting once every rule has been seen", () => {
    expect(pickGrammarNote({ notes, seen: ["a", "b"], atStart: true })).toBeNull();
  });

  it("never interrupts between two exercises, however much is unseen", () => {
    expect(pickGrammarNote({ notes, seen: [], atStart: false })).toBeNull();
  });

  it("shows nothing at all for a skill that teaches no rule", () => {
    expect(pickGrammarNote({ notes: [], seen: [], atStart: true })).toBeNull();
  });

  it("always has something to show when the learner asks for it", () => {
    expect(pickGrammarNote({ notes, seen: ["a", "b"], atStart: false, forced: true })?.id).toBe(
      "a",
    );
  });
});

describe("which note a wrong answer is named after", () => {
  const notes = [note("b", 2), note("a", 1)];

  it("names the rule the lesson showed", () => {
    expect(correctionNoteFor(notes, "b")?.id).toBe("b");
  });

  it("falls back to the skill's first rule when none was shown", () => {
    expect(correctionNoteFor(notes, null)?.id).toBe("a");
  });

  it("has nothing to say for a skill with no rule", () => {
    expect(correctionNoteFor([], null)).toBeNull();
  });
});

describe("the paradigm's spoken structure", () => {
  const cell = (form: string): ParadigmCell & { surfaceForm: string } => ({
    role: "paradigm",
    order: 1,
    rowLabel: "1",
    colKey: "singular",
    surfaceForm: form,
  });

  it("ties every form to its column and its row", () => {
    expect(
      paradigmRowLabel({
        rowHeader: "Class",
        rowLabel: "1",
        columns: ["Singular", "Plural"],
        cells: [cell("zz-one"), cell("zz-many")],
      }),
    ).toBe("Class 1. Singular: zz-one. Plural: zz-many");
  });

  it("leaves an empty column out rather than announcing a blank", () => {
    expect(
      paradigmRowLabel({
        rowHeader: "Class",
        rowLabel: "5",
        columns: ["Singular", "Plural"],
        cells: [cell("zz-one"), null],
      }),
    ).toBe("Class 5. Singular: zz-one");
  });
});

describe("remembering a dismissed note", () => {
  it("keeps a dismissal", () => {
    expect(withNoteSeen([], "note-1")).toEqual(["note-1"]);
  });

  it("records the same note once, however often it is dismissed", () => {
    expect(withNoteSeen(["note-1"], "note-1")).toEqual(["note-1"]);
  });

  it("cannot grow without bound", () => {
    const many = Array.from({ length: SEEN_NOTES_LIMIT + 10 }, (_, i) => `n${i}`);
    const next = withNoteSeen(many, "newest");
    expect(next).toHaveLength(SEEN_NOTES_LIMIT);
    expect(next[next.length - 1]).toBe("newest");
  });

  it("treats an absent, empty or corrupt store as nothing remembered", () => {
    expect(parseSeenNotes(null)).toEqual([]);
    expect(parseSeenNotes("")).toEqual([]);
    expect(parseSeenNotes("not json")).toEqual([]);
    expect(parseSeenNotes('{"a":1}')).toEqual([]);
    expect(parseSeenNotes('["a",2,"b"]')).toEqual(["a", "b"]);
  });

  it("suppresses a note the store already knows about", () => {
    const seen = parseSeenNotes(JSON.stringify(withNoteSeen([], "a")));
    expect(pickGrammarNote({ notes: [note("a", 1)], seen, atStart: true })).toBeNull();
  });
});
