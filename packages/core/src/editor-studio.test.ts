import { describe, expect, it } from "vitest";

import { studioUnitOptions, type AudioQueueUnit } from "./editor-studio.ts";

/** The database as the operator found it on prod: the Phase-0 unit-1 shares order 1. */
const units: AudioQueueUnit[] = [
  { slug: "people", titleKey: "curriculum.units.people.title", order: 2, status: "draft" },
  { slug: "unit-1", titleKey: "units.unit1.title", order: 1, status: "draft" },
  {
    slug: "greet-and-introduce",
    titleKey: "curriculum.units.greet-and-introduce.title",
    order: 1,
    status: "draft",
  },
  { slug: "things", titleKey: "curriculum.units.things.title", order: 3, status: "draft" },
  { slug: "gone", titleKey: "curriculum.units.gone.title", order: 4, status: "retired" },
];

describe("the studio's unit menu", () => {
  it("lists units in course order, numbered, with the superseded unit-1 last and marked old", () => {
    const options = studioUnitOptions(["things", "unit-1", "people", "greet-and-introduce"], units);
    expect(options.map((o) => [o.slug, o.number, o.old])).toEqual([
      ["greet-and-introduce", 1, false],
      ["people", 2, false],
      ["things", 3, false],
      ["unit-1", null, true],
    ]);
    expect(options[0]?.titleKey).toBe("curriculum.units.greet-and-introduce.title");
  });

  it("keeps a unit's course number when an earlier unit has nothing left to record", () => {
    const options = studioUnitOptions(["things"], units);
    expect(options).toEqual([
      { slug: "things", titleKey: "curriculum.units.things.title", number: 3, old: false },
    ]);
  });

  it("marks a retired unit old, and falls back to the slug order when the server sends no units", () => {
    expect(studioUnitOptions(["gone"], units)[0]).toMatchObject({ number: null, old: true });
    expect(studioUnitOptions(["b", "a"], undefined).map((o) => [o.slug, o.number])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});
