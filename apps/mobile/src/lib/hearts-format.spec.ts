import { formatCountdown, heartsBlocked, heartsLabel } from "./hearts-format";

const now = Date.parse("2026-09-04T12:00:00Z");

describe("formatCountdown", () => {
  it("formats hours and minutes, rounding up", () => {
    expect(formatCountdown("2026-09-04T14:05:30Z", now)).toBe("2 h 06 min");
    expect(formatCountdown("2026-09-04T12:12:00Z", now)).toBe("12 min");
  });
  it("is empty when due or unknown", () => {
    expect(formatCountdown(null, now)).toBe("");
    expect(formatCountdown("2026-09-04T11:00:00Z", now)).toBe("");
  });
});

describe("hearts display", () => {
  const state = { hearts: 2, max: 5, unlimited: false, nextRegenAt: null, practiceLeft: 3 };
  it("shows the count, or infinity for Plus (server or local)", () => {
    expect(heartsLabel(state, false)).toBe("2");
    expect(heartsLabel({ ...state, unlimited: true }, false)).toBe("∞");
    expect(heartsLabel(state, true)).toBe("∞");
    expect(heartsLabel(null, false)).toBe("");
  });
  it("blocks only at zero without Plus", () => {
    expect(heartsBlocked({ ...state, hearts: 0 }, false)).toBe(true);
    expect(heartsBlocked({ ...state, hearts: 0 }, true)).toBe(false);
    expect(heartsBlocked({ ...state, hearts: 0, unlimited: true }, false)).toBe(false);
    expect(heartsBlocked(state, false)).toBe(false);
    expect(heartsBlocked(null, false)).toBe(false);
  });
});
