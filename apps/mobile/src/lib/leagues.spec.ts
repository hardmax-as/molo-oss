import { daysLeft, zoneOf } from "./leagues";

describe("leagues", () => {
  it("counts days left inclusively and never below zero", () => {
    expect(daysLeft("2026-09-06", new Date("2026-09-04T10:00:00"))).toBe(3);
    expect(daysLeft("2026-09-06", new Date("2026-09-06T10:00:00"))).toBe(1);
    expect(daysLeft("2026-09-06", new Date("2026-09-08T10:00:00"))).toBe(0);
  });
  it("assigns zones from the rules", () => {
    expect(zoneOf(1, 20, 5, 5)).toBe("promote");
    expect(zoneOf(5, 20, 5, 5)).toBe("promote");
    expect(zoneOf(6, 20, 5, 5)).toBe("stay");
    expect(zoneOf(15, 20, 5, 5)).toBe("stay");
    expect(zoneOf(16, 20, 5, 5)).toBe("demote");
    expect(zoneOf(20, 20, 5, 5)).toBe("demote");
  });
});
