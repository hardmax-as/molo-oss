import { describe, expect, it } from "vitest";

import { HEARTS, regen, toState } from "./hearts.ts";

const t0 = new Date("2026-09-04T12:00:00Z");
const h = (n: number) => new Date(t0.getTime() + n * 60 * 60 * 1000);

describe("hearts regeneration", () => {
  it("gives one heart back every four hours, keeping the remainder", () => {
    const row = { hearts: 2, changedAt: t0, practiceCount: 0 };
    expect(regen(row, h(3)).hearts).toBe(2);
    const r = regen(row, h(9));
    expect(r.hearts).toBe(4);
    expect(r.changedAt.toISOString()).toBe(h(8).toISOString()); // one hour of progress kept
  });

  it("caps at the maximum and never regenerates past it", () => {
    const row = { hearts: 4, changedAt: t0, practiceCount: 0 };
    expect(regen(row, h(40)).hearts).toBe(HEARTS.max);
    expect(regen({ ...row, hearts: 5 }, h(1)).hearts).toBe(5);
  });

  it("reports the next arrival and practice left; plus is unlimited", () => {
    const s = toState({ hearts: 1, changedAt: t0, practiceCount: 3 }, h(1), false);
    expect(s).toMatchObject({ hearts: 1, max: 5, unlimited: false, practiceLeft: 2 });
    expect(s.nextRegenAt).toBe(h(4).toISOString());
    expect(
      toState({ hearts: 5, changedAt: t0, practiceCount: 0 }, h(1), false).nextRegenAt,
    ).toBeNull();
    expect(toState({ hearts: 0, changedAt: t0, practiceCount: 0 }, h(1), true)).toMatchObject({
      hearts: 5,
      unlimited: true,
      nextRegenAt: null,
    });
  });
});
