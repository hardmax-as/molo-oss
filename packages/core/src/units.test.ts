import { describe, expect, it } from "vitest";

import { guestFinishedUnits, lockedUnitIds } from "./units.ts";

describe("lockedUnitIds", () => {
  const units = [
    { id: "u1", prerequisiteUnitId: null },
    { id: "u2", prerequisiteUnitId: "u1" },
    { id: "u3", prerequisiteUnitId: "u2" },
  ];

  it("locks a unit whose prerequisite is unfinished, and the chain behind it", () => {
    expect([...lockedUnitIds(units, new Set())].sort()).toEqual(["u2", "u3"]);
  });

  it("lifts one step at a time as prerequisites are finished", () => {
    expect([...lockedUnitIds(units, new Set(["u1"]))]).toEqual(["u3"]);
    expect([...lockedUnitIds(units, new Set(["u1", "u2"]))]).toEqual([]);
  });

  it("ignores a prerequisite the learner cannot reach at all", () => {
    // u2's prerequisite is not published, so it is not in the list: no lock.
    expect([...lockedUnitIds([{ id: "u2", prerequisiteUnitId: "gone" }], new Set())]).toEqual([]);
  });

  it("does not loop on a cycle", () => {
    const cyclic = [
      { id: "a", prerequisiteUnitId: "b" },
      { id: "b", prerequisiteUnitId: "a" },
    ];
    expect(() => lockedUnitIds(cyclic, new Set())).not.toThrow();
  });
});

describe("guestFinishedUnits", () => {
  const units = [
    { id: "u1", slug: "one", lessonCount: 2 },
    { id: "u2", slug: "two", lessonCount: 1 },
    { id: "u3", slug: "three", lessonCount: 0 },
  ];

  it("counts distinct finished lessons against the unit's published lesson count", () => {
    const finished = guestFinishedUnits(units, [
      { unitSlug: "one", lessonId: "l1" },
      { unitSlug: "one", lessonId: "l1" },
    ]);
    expect([...finished]).toEqual([]);
    expect([
      ...guestFinishedUnits(units, [
        { unitSlug: "one", lessonId: "l1" },
        { unitSlug: "one", lessonId: "l2" },
      ]),
    ]).toEqual(["u1"]);
  });

  it("never counts a unit with no lessons as finished", () => {
    expect([...guestFinishedUnits(units, [{ unitSlug: "three", lessonId: "x" }])]).toEqual([]);
  });
});
