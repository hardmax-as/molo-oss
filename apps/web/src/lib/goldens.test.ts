import { goldenAnswerOf, goldenKey, type GoldenCase } from "@molo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listLexemes, morphPreview } from "./api.ts";
import {
  applySessionDefault,
  checkGoldenForm,
  earlierAnswers,
  goldenNeedsSave,
  mergeGoldenSources,
  nextUnfinished,
  oldCardAnswer,
  orderedGoldens,
  pairProgress,
} from "./goldens.ts";

vi.mock("./api.ts", () => ({ listLexemes: vi.fn(), morphPreview: vi.fn() }));
const c: GoldenCase = {
  lemma: "zz-source",
  class: "1",
  form: "object_concord",
  expected: "zz-tutor",
  validated_by: "",
  validated_on: "",
  irregular: false,
  note: "",
};
beforeEach(() => vi.resetAllMocks());
it("never fetches a generator guess before the tutor has supplied a form", async () => {
  await expect(checkGoldenForm({ ...c, expected: " " })).rejects.toThrow();
  expect(listLexemes).not.toHaveBeenCalled();
  expect(morphPreview).not.toHaveBeenCalled();
});
it("checks only the requested form of the exact lexeme and class through the existing API", async () => {
  vi.mocked(listLexemes).mockResolvedValue({
    lexemes: [{ id: "source-id", lemma: c.lemma, nounClass: c.class }] as Awaited<
      ReturnType<typeof listLexemes>
    >["lexemes"],
    limit: 200,
    offset: 0,
  });
  vi.mocked(morphPreview).mockResolvedValue({
    applicable: true,
    lemma: c.lemma,
    nounClass: c.class,
    validated: false,
    forms: [
      { form: "plural", surface: "zz-other", error: null },
      { form: c.form, surface: c.expected, error: null },
    ],
  });
  expect(await checkGoldenForm(c)).toBe("agrees");
  expect(morphPreview).toHaveBeenCalledWith("source-id");
  expect(await checkGoldenForm({ ...c, expected: "zz-different" })).toBe("differs");
  expect(await checkGoldenForm({ ...c, form: "possessive" })).toBe("unavailable");
});
it("does not substitute a similar lemma or another class", async () => {
  vi.mocked(listLexemes).mockResolvedValue({
    lexemes: [{ id: "wrong", lemma: c.lemma, nounClass: "2" }] as Awaited<
      ReturnType<typeof listLexemes>
    >["lexemes"],
    limit: 200,
    offset: 0,
  });
  expect(await checkGoldenForm(c)).toBe("unavailable");
  expect(morphPreview).not.toHaveBeenCalled();
});

describe("session navigation and defaults (W07)", () => {
  const card = (patch: Partial<GoldenCase>): GoldenCase => ({ ...c, expected: "", ...patch });
  const ready = { expected: "zz-form", validated_by: "zz-tutor", validated_on: "2026-09-24" };

  it("orders by class pair, singular class first, the pair question before the concords", () => {
    const rows = [
      card({ lemma: "zz-c", class: "3", form: "plural" }),
      card({ lemma: "zz-b", class: "2", form: "possessive" }),
      card({ lemma: "zz-b", class: "2", form: "singular" }),
      card({ lemma: "zz-a", class: "1", form: "subject_concord" }),
      card({ lemma: "zz-d", class: "1a", form: "plural" }),
      card({ lemma: "zz-a", class: "1", form: "plural" }),
    ];
    expect(orderedGoldens(rows).map((r) => [r.class, r.form])).toEqual([
      ["1", "plural"],
      ["1", "subject_concord"],
      ["2", "singular"],
      ["2", "possessive"],
      ["1a", "plural"],
      ["3", "plural"],
    ]);
  });

  it("puts the locatives after every pair and concord card, in class order", () => {
    const rows = [
      card({ lemma: "zz-e", class: "3", form: "locative" }),
      card({ lemma: "zz-c", class: "3", form: "plural" }),
      card({ lemma: "zz-a", class: "1", form: "locative" }),
      card({ lemma: "zz-a", class: "1", form: "plural" }),
    ];
    expect(orderedGoldens(rows).map((r) => [r.class, r.form])).toEqual([
      ["1", "plural"],
      ["3", "plural"],
      ["1", "locative"],
      ["3", "locative"],
    ]);
  });

  it("finds the next unfinished case, and none when all are ready", () => {
    const rows = [
      card({ lemma: "zz-a", class: "1", form: "plural", ...ready }),
      card({ lemma: "zz-b", class: "2", form: "plural" }),
    ];
    expect(nextUnfinished(rows)?.lemma).toBe("zz-b");
    expect(nextUnfinished([rows[0]!])).toBeNull();
  });

  it("counts ready cases per class pair", () => {
    const rows = [
      card({ class: "1", ...ready }),
      card({ class: "2", form: "singular" }),
      card({ class: "3", form: "plural" }),
    ];
    expect(pairProgress(rows)[0]).toEqual({ pair: ["1", "2"], ready: 1, count: 2 });
  });

  it("keeps answers to cards the sheet no longer asks, and names the old answer on the new card", () => {
    const view = (caseId: string, form: string) => ({
      caseId,
      form,
      irregular: false,
      notes: "",
      tutorName: "zz-tutor",
      validatedOn: "2026-09-27",
      authorId: null,
      authorName: null,
      updatedAt: "2026-09-27T20:00:00.000Z",
    });
    const sheet = [card({ lemma: "zz-b", class: "2", form: "singular" })];
    const old = view(JSON.stringify(["zz-b", "2", "plural"]), "zz-old-answer");
    const empty = view(JSON.stringify(["zz-x", "4", "plural"]), " ");
    const current = view(JSON.stringify(["zz-b", "2", "singular"]), "zz-new");
    const [kept, ...rest] = earlierAnswers(sheet, [old, empty, current]);
    expect(rest).toEqual([]);
    // The tutor's answer and the card's own form are two different things.
    expect(kept).toMatchObject({
      caseId: old.caseId,
      form: "zz-old-answer",
      caseForm: "plural",
      lemma: "zz-b",
      class: "2",
    });
    expect(oldCardAnswer(sheet[0]!, new Map([[old.caseId, old]]))).toBe("zz-old-answer");
    expect(oldCardAnswer(card({ form: "plural" }), new Map([[old.caseId, old]]))).toBeNull();
  });

  it("fills the session tutor into empty cards and cards on the old value, never over a hand edit", () => {
    const rows = [
      card({ lemma: "zz-empty" }),
      card({ lemma: "zz-old", validated_by: "Old" }),
      card({ lemma: "zz-own", validated_by: "Someone else" }),
    ];
    const next = applySessionDefault(rows, "validated_by", "Old", "New");
    expect(next.map((r) => r.validated_by)).toEqual(["New", "New", "Someone else"]);
    // Leaves every other field alone, and never writes a form.
    expect(next.every((r) => r.expected === "")).toBe(true);
  });
});

describe("the server copy and the offline fallback", () => {
  const sheet: GoldenCase = { ...c, expected: "", note: "source" };
  const typed: GoldenCase = { ...sheet, expected: "zz-typed", validated_by: "Test tutor" };

  it("shows the sheet, then the server's answer, then what this browser has not sent yet", () => {
    const saved = goldenAnswerOf({ ...sheet, expected: "zz-saved" });
    expect(mergeGoldenSources([sheet], [], {})[0]?.expected).toBe("");
    expect(mergeGoldenSources([sheet], [saved], {})[0]?.expected).toBe("zz-saved");
    expect(mergeGoldenSources([sheet], [saved], { [goldenKey(sheet)]: typed })[0]?.expected).toBe(
      "zz-typed",
    );
  });

  it("saves a card the server lacks only once the tutor wrote on it, and one it has whenever it differs", () => {
    // A name filled in from the top is not a reason to create a row.
    expect(goldenNeedsSave({ ...sheet, validated_by: "Test tutor" }, sheet, undefined)).toBe(false);
    expect(goldenNeedsSave(typed, sheet, undefined)).toBe(true);
    expect(goldenNeedsSave({ ...sheet, irregular: true }, sheet, undefined)).toBe(true);
    expect(goldenNeedsSave({ ...sheet, note: "zz why" }, sheet, undefined)).toBe(true);
    const saved = goldenAnswerOf(typed);
    expect(goldenNeedsSave(typed, sheet, saved)).toBe(false);
    expect(goldenNeedsSave({ ...typed, validated_on: "2026-09-26" }, sheet, saved)).toBe(true);
    // Emptying an answer the server holds is a change worth saving ("leave it empty if unsure").
    expect(goldenNeedsSave({ ...typed, expected: "" }, sheet, saved)).toBe(true);
  });
});
