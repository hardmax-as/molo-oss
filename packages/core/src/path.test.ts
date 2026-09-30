import { describe, expect, it } from "vitest";

import { XP } from "./gamification.ts";
import {
  buildPath,
  chestStateOf,
  createLinkDrawMemory,
  crownLevelOf,
  currentNodeKey,
  LINK_STYLE,
  linkDrawWindow,
  linkHalf,
  lessonKindOf,
  MAX_CROWN_LEVEL,
  nodeOffsetOf,
  pathLinks,
  sampleCurve,
  type NodeOffset,
  type PathChestRow,
  type PathLessonRow,
  type PathSkillInput,
  type PathUnitInput,
} from "./path.ts";

describe("lessonKindOf", () => {
  it("reads a listening-led lesson from its exercises", () => {
    expect(lessonKindOf({ types: ["listen_select", "select_listen", "translate_tap"] })).toBe(
      "listen",
    );
  });

  it("calls a lesson with any real speaking a speaking lesson", () => {
    expect(lessonKindOf({ types: ["speak", "listen_select"] })).toBe("speak");
    expect(lessonKindOf({ types: ["click_drill", "click_drill", "listen_select"] })).toBe("speak");
  });

  it("prefers speaking over listening on a tie, because being asked to talk is the surprise", () => {
    expect(lessonKindOf({ types: ["speak", "listen_select"] })).toBe("speak");
  });

  it("is a culture card only when every exercise is one", () => {
    expect(lessonKindOf({ types: ["culture_card", "culture_card"] })).toBe("culture");
    expect(lessonKindOf({ types: ["culture_card", "translate_type"] })).toBe("mixed");
  });

  it("falls back to mixed when nothing dominates", () => {
    expect(lessonKindOf({ types: ["translate_tap", "translate_type", "class_sort"] })).toBe(
      "mixed",
    );
    expect(lessonKindOf({ types: [] })).toBe("mixed");
  });

  it("crowns the unit's last lesson whatever it holds", () => {
    expect(lessonKindOf({ types: ["listen_select"], final: true })).toBe("test");
    expect(lessonKindOf({ types: [], final: true })).toBe("test");
  });
});

describe("crownLevelOf", () => {
  it("counts completions and stops at the cap", () => {
    expect(crownLevelOf(0)).toBe(0);
    expect(crownLevelOf(3)).toBe(3);
    expect(crownLevelOf(99)).toBe(MAX_CROWN_LEVEL);
  });

  it("treats nonsense as never finished", () => {
    expect(crownLevelOf(-4)).toBe(0);
    expect(crownLevelOf(Number.NaN)).toBe(0);
  });
});

describe("chestStateOf", () => {
  const done = { crownLevel: 1 };
  const todo = { crownLevel: 0 };

  it("stays shut until every lesson of the skill is finished", () => {
    expect(chestStateOf({ lessons: [done, todo], claimed: false })).toBe("locked");
    expect(chestStateOf({ lessons: [done, done], claimed: false })).toBe("ready");
  });

  it("is claimed once and never opens again, however the lessons are replayed", () => {
    expect(chestStateOf({ lessons: [done, done], claimed: true })).toBe("claimed");
    expect(chestStateOf({ lessons: [todo, todo], claimed: true })).toBe("claimed");
  });

  it("does not offer a reward for a skill with no lessons", () => {
    expect(chestStateOf({ lessons: [], claimed: false })).toBe("locked");
  });
});

// ---------------------------------------------------------------------------

function lesson(id: string, order: number, crownLevel = 0) {
  return {
    id,
    order,
    kind: "mixed" as const,
    estimatedMinutes: 3,
    exerciseCount: 4,
    crownLevel,
  };
}

const units: PathUnitInput[] = [
  {
    id: "u1",
    slug: "unit-one",
    titleKey: "units.unit1.title",
    cefrBand: "A1",
    locked: false,
    prerequisiteSlug: null,
    prerequisiteTitleKey: null,
    skills: [
      {
        id: "s1",
        slug: "greetings",
        titleKey: "units.unit1.skills.greetings.title",
        kind: "vocab",
        chestClaimed: false,
        lessons: [lesson("l1", 1, 2), lesson("l2", 2)],
      },
    ],
  },
  {
    id: "u2",
    slug: "unit-two",
    titleKey: "units.unit1.skills.numbers.title",
    cefrBand: "A1",
    locked: true,
    prerequisiteSlug: "unit-one",
    prerequisiteTitleKey: "units.unit1.title",
    skills: [
      {
        id: "s2",
        slug: "numbers",
        titleKey: "units.unit1.skills.numbers.title",
        kind: "vocab",
        chestClaimed: false,
        lessons: [lesson("l3", 1)],
      },
    ],
  },
];

describe("buildPath", () => {
  const rows = buildPath(units, { chestXp: XP.skillChest });
  const lessons = rows.filter((r): r is PathLessonRow => r.type === "lesson");
  const chests = rows.filter((r): r is PathChestRow => r.type === "chest");

  it("strings the units together in order, header then skill then nodes then chest", () => {
    expect(rows.map((r) => r.type)).toEqual([
      "unit",
      "skill",
      "lesson",
      "lesson",
      "chest",
      "unit",
      "skill",
      "lesson",
      "chest",
    ]);
  });

  it("marks exactly one node as the current one, the first unfinished open lesson", () => {
    expect(lessons.map((l) => l.state)).toEqual(["done", "current", "locked"]);
    expect(currentNodeKey(rows)).toBe("lesson:l2");
  });

  it("locks every node of a locked unit, and its chest with them", () => {
    expect(chests.map((c) => c.state)).toEqual(["locked", "locked"]);
  });

  it("honours the guest wall without touching the unit lock", () => {
    const walled = buildPath(units, {
      chestXp: XP.skillChest,
      lockedLessonIds: new Set(["l2"]),
    }).filter((r): r is PathLessonRow => r.type === "lesson");
    expect(walled.map((l) => l.state)).toEqual(["done", "locked", "locked"]);
  });

  it("opens the chest once its skill is finished", () => {
    const finished = buildPath(
      [
        {
          ...units[0]!,
          skills: [{ ...units[0]!.skills[0]!, lessons: [lesson("l1", 1, 2), lesson("l2", 2, 1)] }],
        },
      ],
      { chestXp: XP.skillChest },
    );
    const chest = finished.find((r): r is PathChestRow => r.type === "chest")!;
    expect(chest.state).toBe("ready");
    expect(chest.xp).toBe(XP.skillChest);
    expect(currentNodeKey(finished)).toBe("chest:s1");
  });

  it("winds: consecutive nodes do not share the same offset", () => {
    const all = buildPath(units, { chestXp: XP.skillChest }).filter(
      (r) => r.type === "lesson" || r.type === "chest",
    );
    expect(all.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
    expect(lessons[0]!.offset).not.toBe(lessons[1]!.offset);
  });
});

// ---------------------------------------------------------------------------
// The trail between the nodes
// ---------------------------------------------------------------------------

function skill(id: string, lessons: PathSkillInput["lessons"], chestClaimed = false) {
  return { id, slug: id, titleKey: `t.${id}`, kind: "vocab", lessons, chestClaimed };
}

function unit(id: string, skills: PathSkillInput[], locked = false): PathUnitInput {
  return {
    id,
    slug: id,
    titleKey: `t.${id}`,
    cefrBand: "A1",
    locked,
    prerequisiteSlug: null,
    prerequisiteTitleKey: null,
    skills,
  };
}

function trail(input: PathUnitInput[], lockedLessonIds?: ReadonlySet<string>) {
  const rows = buildPath(input, {
    chestXp: XP.skillChest,
    ...(lockedLessonIds ? { lockedLessonIds } : {}),
  });
  const links = pathLinks(rows);
  const at = (key: string) => {
    const found = links.get(key);
    if (!found) throw new Error(`no stop ${key}`);
    return found;
  };
  /** The states of every link, in walking order. */
  const states = () =>
    [...links.values()].flatMap((l) => (l.below ? [`${l.below.key}=${l.below.state}`] : []));
  return { rows, links, at, states };
}

describe("pathLinks", () => {
  const twoSkills = trail([
    unit("u", [
      skill("s1", [lesson("a", 1, 1), lesson("b", 2, 1)], true),
      skill("s2", [lesson("c", 3), lesson("d", 4)]),
    ]),
  ]);

  it("joins the stops of a skill and breaks at every skill title and unit header", () => {
    const { at } = twoSkills;
    expect(at("lesson:a").above).toBeNull();
    expect(at("lesson:a").below).toBe(at("lesson:b").above);
    expect(at("lesson:b").below).toBe(at("chest:s1").above);
    expect(at("chest:s1").below).toBeNull();
    // A new skill starts a new run: nothing crosses its title.
    expect(at("lesson:c").above).toBeNull();
    expect(at("lesson:d").below).toBe(at("chest:s2").above);
    expect(at("chest:s2").below).toBeNull();
  });

  it("runs between the nodes' own offsets, and into a chest on the spine", () => {
    const { rows, at } = twoSkills;
    const a = rows.find((r): r is PathLessonRow => r.key === "lesson:a")!;
    const b = rows.find((r): r is PathLessonRow => r.key === "lesson:b")!;
    const chest = rows.find((r): r is PathChestRow => r.key === "chest:s1")!;
    expect(nodeOffsetOf(chest)).toBe(0);
    expect(at("lesson:a").below).toMatchObject({ from: a.offset, to: b.offset });
    expect(at("chest:s1").above).toMatchObject({ from: b.offset, to: 0 });
  });

  it("is walked up to the current node and still to walk after it", () => {
    const { states } = trail([
      unit("u", [
        skill("s", [lesson("a", 1, 1), lesson("b", 2, 1), lesson("c", 3), lesson("d", 4)]),
      ]),
    ]);
    expect(states()).toEqual([
      "link:lesson:a=done",
      "link:lesson:b=done",
      "link:lesson:c=ahead",
      "link:lesson:d=ahead",
    ]);
  });

  it("walks into a chest once its skill is finished, whether or not it has been opened", () => {
    expect(twoSkills.at("chest:s1").above?.state).toBe("done");
    const ready = trail([unit("u", [skill("s", [lesson("a", 1, 1), lesson("b", 2, 1)])])]);
    expect(ready.at("chest:s").above?.state).toBe("done");
  });

  it("does not join a finished lesson to the current one behind it", () => {
    // Played out of order: b is done, a is still the current one.
    const { states } = trail([unit("u", [skill("s", [lesson("a", 1), lesson("b", 2, 1)])])]);
    expect(states()).toEqual(["link:lesson:a=ahead", "link:lesson:b=ahead"]);
  });

  it("stays muted through a locked unit and past the guest wall", () => {
    expect(trail(units).states()).toEqual([
      "link:lesson:l1=done",
      "link:lesson:l2=ahead",
      "link:lesson:l3=locked",
    ]);
    expect(trail(units, new Set(["l2"])).states()).toEqual([
      "link:lesson:l1=locked",
      "link:lesson:l2=locked",
      "link:lesson:l3=locked",
    ]);
  });

  it("is walked end to end in a crowned unit", () => {
    const crowned = trail([
      unit("u", [
        skill("s1", [lesson("a", 1, 5), lesson("b", 2, 3)], true),
        skill("s2", [lesson("c", 3, 1)], true),
      ]),
    ]);
    expect(crowned.states().every((s) => s.endsWith("=done"))).toBe(true);
    expect(crowned.states()).toHaveLength(3);
  });

  it("draws nothing for a skill that is only a chest, and one link for a one-lesson unit", () => {
    const { at } = trail([unit("u", [skill("empty", []), skill("one", [lesson("a", 1)])])]);
    expect(at("chest:empty")).toEqual({ above: null, below: null });
    expect(at("lesson:a").above).toBeNull();
    expect(at("lesson:a").below).toBe(at("chest:one").above);
  });

  it("names the last walked link of each unit as the one to draw on", () => {
    const { links } = trail([
      // u1: a and b done, c current, so b→c is the newest stretch walked.
      unit("u1", [skill("s1", [lesson("a", 1, 1), lesson("b", 2, 1), lesson("c", 3)])]),
      // u2: d and e done, f merely open (the current node is in u1).
      unit("u2", [skill("s2", [lesson("d", 1, 1), lesson("e", 2, 1), lesson("f", 3)])]),
    ]);
    const latest = [...links.values()]
      .flatMap((l) => (l.below ? [l.below] : []))
      .filter((l) => l.latest)
      .map((l) => `${l.unitId}:${l.key}`);
    expect(latest).toEqual(["u1:link:lesson:b", "u2:link:lesson:d"]);
    // Nothing walked, nothing to draw on.
    expect(
      [...trail([unit("u", [skill("s", [lesson("a", 1), lesson("b", 2)])])]).links.values()].some(
        (l) => l.below?.latest,
      ),
    ).toBe(false);
  });
});

describe("linkHalf", () => {
  const OFFSETS: NodeOffset[] = [-1, 0, 1];
  const spine = LINK_STYLE.width / 2;

  it("starts on the row edge halfway between the nodes and ends under its own node", () => {
    const half = linkHalf({ self: 0, other: 1, reach: 48 });
    expect(half.points[0]).toEqual({ x: spine + LINK_STYLE.shift / 2, y: 0 });
    expect(half.points[3]).toEqual({ x: spine, y: 48 });
    const other = linkHalf({ self: 1, other: 0, reach: 60 });
    expect(other.points[0]).toEqual(half.points[0]);
    expect(other.points[3]).toEqual({ x: spine + LINK_STYLE.shift, y: 60 });
  });

  it("arrives at the node travelling straight down", () => {
    for (const self of OFFSETS)
      for (const other of OFFSETS) {
        const [, , c2, end] = linkHalf({ self, other, reach: 48 }).points;
        expect(c2.x).toBe(end.x);
        expect(c2.y).toBeLessThan(end.y);
      }
  });

  it("meets its other half without a kink, whatever the two rows' heights", () => {
    for (const a of OFFSETS)
      for (const b of OFFSETS) {
        // The upper stop's half is drawn mirrored, so its lean points up.
        const upper = linkHalf({ self: a, other: b, reach: 48 });
        const lower = linkHalf({ self: b, other: a, reach: 60 });
        expect(upper.points[0]).toEqual(lower.points[0]);
        const [u0, u1] = upper.points;
        const [l0, l1] = lower.points;
        // Mirrored handle (u1.x - u0.x, -lean) is the exact opposite of (l1.x - l0.x, lean).
        expect(u1.x - u0.x).toBeCloseTo(-(l1.x - l0.x), 10);
        expect(u1.y).toBe(l1.y);
        expect(u1.y).toBeGreaterThan(0);
      }
  });

  it("is a straight drop when both nodes sit on the same line", () => {
    const half = linkHalf({ self: 0, other: 0, reach: 44 });
    expect(new Set(half.points.map((p) => p.x)).size).toBe(1);
    expect(half.length).toBeCloseTo(44, 6);
  });

  it("stays in its lane: between the join and its node, and inside the drawing box", () => {
    const cap = LINK_STYLE.stroke / 2;
    for (const self of OFFSETS)
      for (const other of OFFSETS)
        for (const reach of [44, 48, 60]) {
          const half = linkHalf({ self, other, reach });
          const [start, , , end] = half.points;
          const lo = Math.min(start.x, end.x);
          const hi = Math.max(start.x, end.x);
          for (const p of sampleCurve(half.points, 64)) {
            expect(p.x).toBeGreaterThanOrEqual(lo - 1e-9);
            expect(p.x).toBeLessThanOrEqual(hi + 1e-9);
            expect(p.y).toBeGreaterThanOrEqual(-1e-9);
            expect(p.y).toBeLessThanOrEqual(reach + 1e-9);
            expect(p.x - cap).toBeGreaterThanOrEqual(0);
            expect(p.x + cap).toBeLessThanOrEqual(LINK_STYLE.width);
          }
        }
  });

  it("measures its own length, for drawing it on", () => {
    const half = linkHalf({ self: 1, other: 0, reach: 48 });
    const [p0, p1, p2, p3] = half.points;
    const chord = Math.hypot(p3.x - p0.x, p3.y - p0.y);
    const hull =
      Math.hypot(p1.x - p0.x, p1.y - p0.y) +
      Math.hypot(p2.x - p1.x, p2.y - p1.y) +
      Math.hypot(p3.x - p2.x, p3.y - p2.y);
    expect(half.length).toBeGreaterThan(chord);
    expect(half.length).toBeLessThan(hull);
  });

  it("writes path data both renderers read, and carries the dashes on into a straight run", () => {
    const half = linkHalf({ self: 0, other: -1, reach: 48 });
    expect(half.d).toBe("M36 0C50 12 64 24 64 48");
    const period = LINK_STYLE.dash + LINK_STYLE.gap;
    expect(half.runDashOffset).toBeCloseTo((LINK_STYLE.dash / 2 + half.length) % period, 10);
  });

  it("never folds back on itself in a row shorter than its lean", () => {
    const [p0, p1, p2, p3] = linkHalf({ self: 0, other: 1, reach: 10 }).points;
    expect(p0.y).toBeLessThanOrEqual(p1.y);
    expect(p1.y).toBeLessThanOrEqual(p2.y);
    expect(p2.y).toBeLessThanOrEqual(p3.y);
  });
});

describe("createLinkDrawMemory", () => {
  const first = { key: "link:lesson:a", unitId: "u" };
  const next = { key: "link:lesson:b", unitId: "u" };

  it("only records the first sighting of a unit, so opening the app replays nothing", () => {
    const memory = createLinkDrawMemory(900);
    expect(memory.start(first, 0)).toBeNull();
    expect(memory.start(first, 5_000)).toBeNull();
  });

  it("draws a newly walked link once, and gives its second half the same clock", () => {
    const memory = createLinkDrawMemory(900);
    memory.start(first, 0);
    expect(memory.start(next, 10_000)).toBe(10_000);
    expect(memory.start(next, 10_300)).toBe(10_000);
    expect(memory.start(next, 11_000)).toBeNull();
    expect(memory.start(next, 60_000)).toBeNull();
  });

  it("keeps each unit's trail apart", () => {
    const memory = createLinkDrawMemory(900);
    memory.start(first, 0);
    expect(memory.start({ key: "link:lesson:x", unitId: "other" }, 1_000)).toBeNull();
  });
});

describe("linkDrawWindow", () => {
  it("draws the upper stop's half first and the lower stop's half second", () => {
    expect(linkDrawWindow("below", 0, 0, 900)).toEqual({ delay: 0, duration: 450 });
    expect(linkDrawWindow("above", 0, 0, 900)).toEqual({ delay: 450, duration: 450 });
  });

  it("catches up when a half asks late, and skips a turn that is over", () => {
    expect(linkDrawWindow("below", 0, 600, 900)).toBeNull();
    expect(linkDrawWindow("above", 0, 600, 900)).toEqual({ delay: 0, duration: 300 });
    expect(linkDrawWindow("above", 0, 900, 900)).toBeNull();
  });
});
