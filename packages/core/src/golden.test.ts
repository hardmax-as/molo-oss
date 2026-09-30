import { describe, expect, it } from "vitest";

import { goldenToml, isValidatedGolden, mergeGoldens, type GoldenCase } from "./golden.ts";

const blank: GoldenCase = {
  lemma: "zz-source",
  class: "1",
  form: "plural",
  expected: "",
  validated_by: "",
  validated_on: "",
  irregular: false,
  note: "fixture",
};
const validated: GoldenCase = {
  ...blank,
  expected: "zz-tutor",
  validated_by: "Test tutor",
  validated_on: "2026-09-21",
};

describe("human golden cases", () => {
  it("requires a form, named validator and real calendar date", () => {
    expect(isValidatedGolden(blank)).toBe(false);
    expect(isValidatedGolden(validated)).toBe(true);
    for (const patch of [
      { expected: " " },
      { validated_by: "" },
      { validated_on: "" },
      { validated_on: "2026-02-30" },
    ]) {
      expect(() => mergeGoldens([blank], [{ ...validated, ...patch }])).toThrow();
    }
  });
  it("upserts by lemma, class and form, idempotently without filling other forms", () => {
    const other = { ...blank, form: "possessive" as const };
    const once = mergeGoldens([blank, other], [validated]);
    expect(once).toEqual([validated, other]);
    expect(mergeGoldens(once, [validated])).toEqual(once);
    expect(mergeGoldens(once, [{ ...validated, class: "2", form: "object_concord" }])).toHaveLength(
      3,
    );
  });
  it("refuses ambiguous duplicate imports", () => {
    expect(() =>
      mergeGoldens([blank], [validated, { ...validated, expected: "zz-other" }]),
    ).toThrow("Duplicate");
  });
  it("keeps empty placeholders marked and escapes multiline human notes", () => {
    expect(goldenToml([blank])).toContain('expected = "" # TUTOR-VALIDATE');
    expect(goldenToml([{ ...validated, note: 'Line "one"\nLine two\\' }])).toContain(
      'note = "Line \\"one\\"\\nLine two\\\\"',
    );
  });
});
