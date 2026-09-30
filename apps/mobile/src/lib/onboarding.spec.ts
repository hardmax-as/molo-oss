import {
  GOAL_PRESETS,
  ONBOARDING_STEPS,
  nextStep,
  onboardedFrom,
  onboardingClickUrl,
} from "./onboarding-steps";

describe("Meet the clicks (audit M10)", () => {
  const clicks = [
    { base: "q", variant: "aspirated", audio: { url: "https://audio.test/qh.opus" } },
    { base: "q", variant: "plain", audio: { url: "https://audio.test/q.opus" } },
  ];
  it("plays the published plain click", () => {
    expect(onboardingClickUrl(clicks, "q")).toBe("https://audio.test/q.opus");
  });
  it("offers nothing to play when that click has no published recording", () => {
    expect(onboardingClickUrl(clicks, "c")).toBeNull();
    expect(onboardingClickUrl([], "x")).toBeNull();
    expect(onboardingClickUrl(undefined, "x")).toBeNull();
  });
});

describe("onboarded (MOL-66)", () => {
  it("a guest follows the device flag", () => {
    expect(onboardedFrom(false, undefined, true)).toBe(true);
    expect(onboardedFrom(false, undefined, false)).toBe(false);
  });
  it("signed in: the server flag, or the device flag the welcome flow just set", () => {
    expect(onboardedFrom(true, "2026-09-24T00:00:00Z", false)).toBe(true);
    expect(onboardedFrom(true, null, true)).toBe(true);
    expect(onboardedFrom(true, null, false)).toBe(false);
    expect(onboardedFrom(true, undefined, false)).toBe(false);
  });
});

describe("onboarding", () => {
  it("has six steps and three goal presets", () => {
    expect(ONBOARDING_STEPS).toHaveLength(6);
    expect(GOAL_PRESETS.map((g) => g.xp)).toEqual([20, 50, 100]);
  });
  it("steps forward, never below the first, and leaves after the last", () => {
    expect(nextStep(0, -1)).toBe(0);
    expect(nextStep(0, 1)).toBe(1);
    expect(nextStep(4, 1)).toBe(5);
    expect(nextStep(5, 1)).toBe(-1);
  });
});
