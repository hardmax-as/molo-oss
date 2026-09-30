import { describe, expect, it } from "vitest";

import { parseDrafts } from "./gloss.ts";

/**
 * The file comes from outside this command — another agent, a translator, a
 * paid API — so the parser is deliberately liberal about shape. It is the
 * database check afterwards that decides what is written, not this.
 */
describe("parseDrafts", () => {
  const row = { lexemeId: "a", gloss: "komme" };

  it("reads a JSON array", () => {
    expect(parseDrafts(JSON.stringify([row]))).toEqual([row]);
  });

  it("reads the exported document with the answers filled in", () => {
    const doc = { language: "nb", system: "...", words: [row] };
    expect(parseDrafts(JSON.stringify(doc))).toEqual([row]);
  });

  it("reads JSON Lines, blank lines and all", () => {
    const jsonl = `${JSON.stringify(row)}\n\n${JSON.stringify({ lexemeId: "b", gloss: "gå" })}\n`;
    expect(parseDrafts(jsonl).map((d) => d.lexemeId)).toEqual(["a", "b"]);
  });

  it("reads a single object", () => {
    expect(parseDrafts(JSON.stringify(row))).toEqual([row]);
  });

  it("accepts either spelling of the optional notes", () => {
    const [snake] = parseDrafts(
      JSON.stringify([{ ...row, usage_note: "u", contrastive_note: "c" }]),
    );
    const [camel] = parseDrafts(JSON.stringify([{ ...row, usageNote: "u", contrastiveNote: "c" }]));
    expect(snake).toEqual({ ...row, usage_note: "u", contrastive_note: "c" });
    expect(camel).toEqual(snake);
  });

  it("drops rows that are missing the two fields that matter", () => {
    const mixed = JSON.stringify([row, { gloss: "no id" }, { lexemeId: "c" }, "nonsense", null]);
    expect(parseDrafts(mixed)).toEqual([row]);
  });

  it("skips a line it cannot parse rather than losing the file", () => {
    const jsonl = `${JSON.stringify(row)}\nnot json at all\n${JSON.stringify({ lexemeId: "b", gloss: "gå" })}`;
    expect(parseDrafts(jsonl).map((d) => d.lexemeId)).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseDrafts("")).toEqual([]);
    expect(parseDrafts("   \n  ")).toEqual([]);
  });
});

describe("parseDrafts: the answerer's own read on the row", () => {
  const row = { lexemeId: "a", gloss: "komme" };

  it("keeps a confidence it recognises", () => {
    for (const c of ["high", "medium", "low"] as const) {
      expect(parseDrafts(JSON.stringify([{ ...row, confidence: c }]))[0]?.confidence).toBe(c);
    }
  });

  it("drops a confidence it does not recognise rather than passing it on", () => {
    expect(
      parseDrafts(JSON.stringify([{ ...row, confidence: "quite sure" }]))[0]?.confidence,
    ).toBeUndefined();
    expect(parseDrafts(JSON.stringify([{ ...row, confidence: 3 }]))[0]?.confidence).toBeUndefined();
  });

  it("keeps a caveat with something in it and drops an empty one", () => {
    expect(parseDrafts(JSON.stringify([{ ...row, caveat: "two senses" }]))[0]?.caveat).toBe(
      "two senses",
    );
    expect(parseDrafts(JSON.stringify([{ ...row, caveat: "   " }]))[0]?.caveat).toBeUndefined();
  });

  it("still reads a row that carries neither", () => {
    expect(parseDrafts(JSON.stringify([row]))[0]).toEqual(row);
  });
});
