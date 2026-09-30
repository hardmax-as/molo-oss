import { countAt, easeOut } from "./easing";

describe("count-up", () => {
  it("eases out and lands exactly on the target", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(countAt(0, 40, 0)).toBe(0);
    expect(countAt(0, 40, 1)).toBe(40);
    expect(countAt(10, 40, 2)).toBe(40);
    expect(countAt(0, 40, 0.5)).toBe(35);
  });
});
