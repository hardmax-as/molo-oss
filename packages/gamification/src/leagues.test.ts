import { describe, expect, it } from "vitest";

import { nextTier, outcomesFor, weekEndOf, weekStartOf, zoneFor } from "./leagues.ts";

describe("weeks", () => {
  it("starts on Monday UTC and ends the next Monday", () => {
    expect(weekStartOf(new Date("2026-09-04T10:00:00Z"))).toBe("2026-08-31"); // Friday -> Monday
    expect(weekStartOf(new Date("2026-08-31T00:00:00Z"))).toBe("2026-08-31"); // Monday stays
    expect(weekStartOf(new Date("2026-09-06T23:59:59Z"))).toBe("2026-08-31"); // Sunday
    expect(weekEndOf("2026-08-31")).toBe("2026-09-07");
  });
});

describe("outcomesFor", () => {
  const cohort = Array.from({ length: 12 }, (_, i) => ({ userId: `u${i}`, xp: 120 - i * 10 }));

  it("promotes the top five and demotes the bottom five in a middle tier", () => {
    const out = outcomesFor(cohort, "gold");
    expect(out.slice(0, 5).map((o) => o.outcome)).toEqual(Array(5).fill("promoted"));
    expect(out.slice(5, 7).map((o) => o.outcome)).toEqual(["stayed", "stayed"]);
    expect(out.slice(7).map((o) => o.outcome)).toEqual(Array(5).fill("demoted"));
    expect(out.map((o) => o.rank)).toEqual(cohort.map((_, i) => i + 1));
  });

  it("never demotes from bronze or promotes from ruby", () => {
    expect(outcomesFor(cohort, "bronze").every((o) => o.outcome !== "demoted")).toBe(true);
    expect(outcomesFor(cohort, "ruby").every((o) => o.outcome !== "promoted")).toBe(true);
  });

  it("does not promote a learner with zero XP and keeps promotion over demotion in tiny cohorts", () => {
    expect(outcomesFor([{ userId: "a", xp: 0 }], "silver")[0]?.outcome).toBe("stayed");
    const three = outcomesFor(
      [
        { userId: "a", xp: 30 },
        { userId: "b", xp: 20 },
        { userId: "c", xp: 10 },
      ],
      "silver",
    );
    expect(three.map((o) => o.outcome)).toEqual(["promoted", "promoted", "promoted"]);
  });

  it("moves tiers by outcome and clamps at the ends", () => {
    expect(nextTier("bronze", "promoted")).toBe("silver");
    expect(nextTier("ruby", "promoted")).toBe("ruby");
    expect(nextTier("bronze", "demoted")).toBe("bronze");
    expect(nextTier("gold", "demoted")).toBe("silver");
  });

  it("reports the zone during the week", () => {
    expect(zoneFor(1, 20, "gold")).toBe("promote");
    expect(zoneFor(18, 20, "gold")).toBe("demote");
    expect(zoneFor(10, 20, "gold")).toBe("stay");
    expect(zoneFor(18, 20, "bronze")).toBe("stay");
    expect(zoneFor(1, 20, "ruby")).toBe("stay");
  });
});
