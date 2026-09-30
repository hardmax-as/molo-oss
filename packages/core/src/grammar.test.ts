import { describe, expect, it } from "vitest";

import {
  correctionNoteFor,
  displayMorphemes,
  paradigmOf,
  parseSeenNotes,
  pickGrammarNote,
  SEEN_NOTES_LIMIT,
  shouldShowGrammarNote,
  splitMorphemes,
  withNoteSeen,
  workedExampleOf,
  type GrammarCellView,
} from "./grammar.ts";
import { grammarNotePublishGate } from "./publish-gate.ts";

function cell(over: Partial<GrammarCellView> & { id: string }): GrammarCellView {
  return {
    role: "paradigm",
    order: 1,
    rowLabel: "1",
    colKey: "word",
    surfaceForm: "zz-form",
    morphemes: [],
    lexemeId: null,
    audioAssetId: null,
    ...over,
  };
}

describe("when a grammar note is shown", () => {
  const note = { id: "note-1" };

  it("shows an unseen note at the start of a lesson", () => {
    expect(shouldShowGrammarNote({ note, seen: [], atStart: true })).toBe(true);
  });

  it("suppresses a note the learner has already dismissed", () => {
    expect(shouldShowGrammarNote({ note, seen: ["note-1"], atStart: true })).toBe(false);
  });

  it("never interrupts mid-lesson, even unseen", () => {
    expect(shouldShowGrammarNote({ note, seen: [], atStart: false })).toBe(false);
  });

  it("shows nothing when the skill has no published note", () => {
    expect(shouldShowGrammarNote({ note: null, seen: [], atStart: true })).toBe(false);
    expect(shouldShowGrammarNote({ note: undefined, seen: [], atStart: true, forced: true })).toBe(
      false,
    );
  });

  it("always shows a note the learner asked for, seen or not, start or not", () => {
    expect(shouldShowGrammarNote({ note, seen: ["note-1"], atStart: false, forced: true })).toBe(
      true,
    );
  });

  it("is unaffected by another skill's note being seen", () => {
    expect(shouldShowGrammarNote({ note, seen: ["note-2"], atStart: true })).toBe(true);
  });
});

describe("morphemes", () => {
  it("splits the corpus's own hyphenated segmentation", () => {
    expect(splitMorphemes("aba-ntu")).toEqual(["aba", "ntu"]);
  });

  it("drops the corpus's empty placeholder rather than drawing an empty box", () => {
    expect(splitMorphemes("_")).toEqual([]);
    expect(splitMorphemes("")).toEqual([]);
    expect(splitMorphemes("i--nja")).toEqual(["i", "nja"]);
  });

  it("puts the boundary marker back for display, and leaves one that is already there", () => {
    expect(displayMorphemes(["aba", "ntu"])).toEqual(["aba-", "-ntu"]);
    expect(displayMorphemes(["-m-"])).toEqual(["-m-"]);
    expect(displayMorphemes(["u-"])).toEqual(["u-"]);
    expect(displayMorphemes([])).toEqual([]);
  });
});

describe("paradigmOf", () => {
  const cells = [
    cell({ id: "a", order: 1, rowLabel: "1", colKey: "singular", surfaceForm: "zz-a" }),
    cell({ id: "b", order: 2, rowLabel: "1", colKey: "plural", surfaceForm: "zz-b" }),
    cell({ id: "c", order: 3, rowLabel: "7", colKey: "singular", surfaceForm: "zz-c" }),
    cell({ id: "x", order: 0, role: "example", rowLabel: "", colKey: "word" }),
  ];

  it("keeps the editor's column and row order and ignores the worked example", () => {
    const p = paradigmOf(cells);
    expect(p.columns).toEqual(["singular", "plural"]);
    expect(p.rows.map((r) => r.label)).toEqual(["1", "7"]);
  });

  it("leaves a hole where a row has no cell for a column", () => {
    const p = paradigmOf(cells);
    expect(p.rows[1]?.cells[1]).toBeNull();
    expect(p.rows[0]?.cells[1]?.id).toBe("b");
  });

  it("keeps the first of a duplicated cell rather than hiding the mistake", () => {
    const p = paradigmOf([
      ...cells,
      cell({ id: "dup", order: 9, rowLabel: "1", colKey: "singular", surfaceForm: "zz-dup" }),
    ]);
    expect(p.rows[0]?.cells[0]?.id).toBe("a");
  });

  it("picks the worked example out in order", () => {
    expect(workedExampleOf(cells).map((c) => c.id)).toEqual(["x"]);
  });
});

describe("the grammar-note publish gate", () => {
  const base = {
    createdBy: "editor-a",
    approver: { id: "editor-b", roles: ["editor"] as const },
    bodyLanguages: ["en", "nb"],
    references: [],
    workedExampleCells: 1,
  };
  const ctx = { sourceLanguages: ["en", "nb"] };

  it("passes a complete note", () => {
    expect(grammarNotePublishGate(base, ctx).ok).toBe(true);
  });

  it("refuses a note that is missing a language", () => {
    const r = grammarNotePublishGate({ ...base, bodyLanguages: ["en"] }, ctx);
    expect(r.ok).toBe(false);
    expect(r.failures).toContainEqual({ code: "body_missing", detail: "nb" });
  });

  it("refuses a rule with no worked example", () => {
    const r = grammarNotePublishGate({ ...base, workedExampleCells: 0 }, ctx);
    expect(r.failures.map((f) => f.code)).toContain("worked_example_missing");
  });

  it("refuses a note whose example word is not published", () => {
    const r = grammarNotePublishGate(
      { ...base, references: [{ kind: "lexeme" as const, id: "lex-1", status: "draft" as const }] },
      ctx,
    );
    expect(r.failures).toContainEqual({
      code: "referenced_entity_not_published",
      detail: "lexeme:lex-1",
    });
  });

  it("refuses the creator approving their own note", () => {
    const r = grammarNotePublishGate(
      { ...base, approver: { id: "editor-a", roles: ["editor"] as const } },
      ctx,
    );
    expect(r.failures.map((f) => f.code)).toContain("four_eyes");
  });

  it("refuses a learner as approver", () => {
    const r = grammarNotePublishGate(
      { ...base, approver: { id: "learner-1", roles: ["learner"] as const } },
      ctx,
    );
    expect(r.failures.map((f) => f.code)).toContain("approver_not_editorial");
  });
});

describe("which of a skill's notes stops the learner", () => {
  const notes = [
    { id: "b", order: 2 },
    { id: "a", order: 1 },
  ];

  it("picks the first unseen rule, in the editor's order and not the array's", () => {
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
  const notes = [
    { id: "b", order: 2 },
    { id: "a", order: 1 },
  ];

  it("names the rule the lesson actually showed", () => {
    expect(correctionNoteFor(notes, "b")?.id).toBe("b");
  });

  it("falls back to the skill's first rule when the learner has seen them all", () => {
    expect(correctionNoteFor(notes, null)?.id).toBe("a");
  });

  it("has nothing to say for a skill with no rule", () => {
    expect(correctionNoteFor([], null)).toBeNull();
  });
});

describe("remembering a dismissal", () => {
  it("keeps a dismissal, and the same one only once", () => {
    expect(withNoteSeen([], "n1")).toEqual(["n1"]);
    expect(withNoteSeen(["n1"], "n1")).toEqual(["n1"]);
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
});
