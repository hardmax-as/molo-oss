import { DEMO_GROUPS, DEMOS, allDemos, demoById, demosIn, groupedDemos } from "./catalog.ts";
import { DEV_STRINGS } from "./strings.ts";

/**
 * The developer gallery's registry. The catalog is pure on purpose so this
 * runs without a native module: which id renders which component is checked
 * by the compiler instead, because `DEMO_VIEWS` is a
 * `Record<ViewDemoId, DemoView>` — a catalogued demo with no view does not
 * build, and a view with no catalogue entry does not either.
 */
describe("developer gallery catalog", () => {
  it("has a unique id for every demo", () => {
    const ids = DEMOS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ids are route-safe slugs", () => {
    for (const demo of DEMOS) expect(demo.id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  it("finds every demo by its id, and nothing else", () => {
    for (const demo of DEMOS) expect(demoById(demo.id)).toBe(demo);
    expect(demoById("no-such-demo")).toBeUndefined();
  });

  it("puts every demo in exactly one listed group, and leaves no group empty", () => {
    for (const demo of DEMOS) expect(DEMO_GROUPS).toContain(demo.group);
    for (const group of DEMO_GROUPS) expect(demosIn(group).length).toBeGreaterThan(0);
    expect(DEMOS.length).toBe(DEMO_GROUPS.flatMap((g) => demosIn(g)).length);
  });

  it("names and describes every demo in developer English", () => {
    for (const demo of DEMOS) {
      expect(demo.title.trim().length).toBeGreaterThan(0);
      expect(demo.note.trim().length).toBeGreaterThan(0);
    }
  });

  it("only ever points at the app's own routes", () => {
    for (const demo of allDemos()) {
      if (demo.href !== undefined) expect(demo.href).toMatch(/^\/[a-z0-9\-/[\]]*$/);
    }
  });

  it("groups the demos in the listed order, losing none", () => {
    const grouped = groupedDemos();
    expect(grouped.map((g) => g.group)).toEqual([...DEMO_GROUPS]);
    for (const g of grouped) expect(g.title).toBe(DEV_STRINGS.groups[g.group]);
    expect(grouped.flatMap((g) => g.demos).length).toBe(DEMOS.length);
  });

  it("covers each beat, each exercise type and each node kind", () => {
    const ids = DEMOS.map((d) => d.id);
    for (const milestone of [25, 50, 100, 250, 500])
      expect(ids).toContain(`milestone-${milestone}`);
    for (const type of [
      "listen-select",
      "select-listen",
      "match-pairs",
      "class-sort",
      "translate-tap",
      "translate-type",
      "concord-fill",
      "click-drill",
      "speak",
      "culture-card",
    ])
      expect(ids).toContain(`exercise-${type}`);
    for (const id of ["check-bar-unanswered", "check-bar-right", "check-bar-wrong"])
      expect(ids).toContain(id);
  });
});
