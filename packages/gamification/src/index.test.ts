import { describe, expect, it } from "vitest";

import { isoDate, lessonXp, reviewXp } from "./index.ts";

describe("lessonXp", () => {
  it("pays 10 per correct, 15 per click-drill correct, +20 for a perfect lesson", () => {
    expect(lessonXp({ correct: 4, total: 5 })).toEqual({ xp: 40, perfect: false });
    expect(lessonXp({ correct: 5, total: 5 })).toEqual({ xp: 70, perfect: true });
    expect(lessonXp({ correct: 5, total: 5, clickDrillCorrect: 2 })).toEqual({
      xp: 30 + 30 + 20,
      perfect: true,
    });
  });

  it("caps tampered inputs", () => {
    expect(lessonXp({ correct: 99, total: 3 })).toEqual({ xp: 50, perfect: true });
    expect(lessonXp({ correct: -5, total: 3 })).toEqual({ xp: 0, perfect: false });
    expect(lessonXp({ correct: 2, total: 3, clickDrillCorrect: 10 })).toEqual({
      xp: 30,
      perfect: false,
    });
  });

  it("gives nothing for again and 10 otherwise", () => {
    expect(reviewXp(1)).toBe(0);
    expect(reviewXp(3)).toBe(10);
  });

  it("formats dates", () => {
    expect(isoDate(new Date("2026-09-03T23:59:59Z"))).toBe("2026-09-03");
  });
});
