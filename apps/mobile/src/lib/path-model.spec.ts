import type { PathChestRow, PathLessonRow } from "@molo/core";

import { NO_PROGRESS, pathSections, unitPathRows, type PathUnitPayload } from "./path-model.ts";

/** A unit shaped like the API's, small enough to reason about. */
function unit(): PathUnitPayload {
  const exercise = (id: string, type: string) => ({ id, order: 1, type, payload: {} }) as never;
  return {
    id: "u1",
    slug: "zz-unit",
    titleKey: "units.unit1.title",
    order: 1,
    cefrBand: "A1",
    prerequisiteUnitId: null,
    lessonCount: 3,
    locked: false,
    prerequisiteSlug: null,
    prerequisiteTitleKey: null,
    skills: [
      {
        id: "s1",
        slug: "greetings",
        titleKey: "units.unit1.skills.greetings.title",
        order: 1,
        kind: "vocab",
        lessons: [
          {
            id: "l1",
            order: 1,
            estimatedMinutes: 3,
            exercises: [exercise("e1", "listen_select"), exercise("e2", "select_listen")],
          },
          {
            id: "l2",
            order: 2,
            estimatedMinutes: 4,
            exercises: [exercise("e3", "speak"), exercise("e4", "translate_tap")],
          },
        ],
      },
      {
        id: "s2",
        slug: "clicks",
        titleKey: "units.unit1.skills.clicks.title",
        order: 2,
        kind: "pronunciation",
        lessons: [
          {
            id: "l3",
            order: 1,
            estimatedMinutes: 5,
            exercises: [exercise("e5", "translate_type")],
          },
        ],
      },
    ],
  } as unknown as PathUnitPayload;
}

const lessons = (rows: readonly unknown[]) =>
  (rows as PathLessonRow[]).filter((r) => r.type === "lesson");
const chests = (rows: readonly unknown[]) =>
  (rows as PathChestRow[]).filter((r) => r.type === "chest");

describe("unitPathRows", () => {
  it("gives every node an icon from what its lesson actually drills", () => {
    const rows = unitPathRows(unit(), NO_PROGRESS);
    expect(lessons(rows).map((l) => l.kind)).toEqual(["listen", "speak", "test"]);
  });

  it("closes each skill with a chest and keeps the walking order", () => {
    const rows = unitPathRows(unit(), NO_PROGRESS);
    expect(rows.map((r) => r.type)).toEqual([
      "unit",
      "skill",
      "lesson",
      "lesson",
      "chest",
      "skill",
      "lesson",
      "chest",
    ]);
  });

  it("points at the first unfinished lesson and fills the finished ones", () => {
    const rows = unitPathRows(unit(), { ...NO_PROGRESS, crownOf: (id) => (id === "l1" ? 2 : 0) });
    expect(lessons(rows).map((l) => l.state)).toEqual(["done", "current", "open"]);
    expect(lessons(rows)[0]!.crownLevel).toBe(2);
  });

  it("opens a skill's chest only once every lesson in it is finished", () => {
    const partly = unitPathRows(unit(), { ...NO_PROGRESS, crownOf: (id) => (id === "l1" ? 1 : 0) });
    expect(chests(partly).map((c) => c.state)).toEqual(["locked", "locked"]);
    const done = unitPathRows(unit(), { ...NO_PROGRESS, crownOf: () => 1 });
    expect(chests(done).map((c) => c.state)).toEqual(["ready", "ready"]);
  });

  it("never reopens a chest that has been taken", () => {
    const rows = unitPathRows(unit(), {
      ...NO_PROGRESS,
      crownOf: () => 1,
      chestClaimed: (id) => id === "s1",
    });
    expect(chests(rows).map((c) => c.state)).toEqual(["claimed", "ready"]);
  });

  it("shuts every node of a locked unit", () => {
    const rows = unitPathRows(unit(), { ...NO_PROGRESS, unitLocked: true });
    expect(lessons(rows).every((l) => l.state === "locked")).toBe(true);
    expect(chests(rows).every((c) => c.state === "locked")).toBe(true);
  });

  it("shuts a lesson behind the guest account wall without locking the unit", () => {
    const rows = unitPathRows(unit(), { ...NO_PROGRESS, lessonWalled: (id) => id !== "l1" });
    expect(lessons(rows).map((l) => l.state)).toEqual(["current", "locked", "locked"]);
  });
});

describe("pathSections", () => {
  it("puts every node under its unit header, so the sticky header has something to be", () => {
    const sections = pathSections(unitPathRows(unit(), NO_PROGRESS));
    expect(sections).toHaveLength(1);
    expect(sections[0]!.unit.type).toBe("unit");
    expect(sections[0]!.data.some((r) => r.type === "unit")).toBe(false);
    expect(sections[0]!.data).toHaveLength(7);
  });
});
