import { describe, expect, it } from "vitest";

import { countForms, mine, toCsv, tokenise } from "./vukuzenzele.ts";

describe("vukuzenzele mining", () => {
  it("tokenises to lowercase letter runs without tone marks", () => {
    expect(tokenise("Molo! Unjáni, mhlobo wam?")).toEqual(["molo", "unjani", "mhlobo", "wam"]);
  });

  it("counts forms and measures lexicon coverage without writing anything", () => {
    const texts = ["inja inja ikati", "ikati ihashe inja", "urhulumente urhulumente urhulumente"];
    const { tokens } = countForms(texts);
    expect(tokens).toBe(9);
    const r = mine(texts, new Set(["inja", "ikati"]), { minCount: 2 });
    expect(r.coverage).toBeCloseTo(5 / 9);
    expect(r.seen).toEqual([
      { lemma: "inja", count: 3 },
      { lemma: "ikati", count: 2 },
    ]);
    expect(r.missing).toEqual([{ form: "urhulumente", count: 3 }]); // ihashe is below minCount
    expect(toCsv(r)).toContain("missing,urhulumente,3");
  });
});
