import { describe, expect, it } from "vitest";

import { ageEligibility, ageStepOutcome } from "./age-gate.ts";

const now = new Date("2026-09-20T12:00:00Z");
describe("registration age gate", () => {
  it.each(["NO", "OTHER"])("refuses under 13 in %s even with a forged confirmation", (country) => {
    expect(ageEligibility({ birthYear: 2014, country, ageReached: true }, now)).toEqual({
      ok: false,
      reason: "under13",
    });
    expect(ageEligibility({ birthYear: 2012, country }, now)).toEqual({ ok: true });
  });
  it("requires 18 in South Africa", () => {
    expect(ageEligibility({ birthYear: 2009, country: "ZA", ageReached: true }, now)).toEqual({
      ok: false,
      reason: "under18ZA",
    });
    expect(ageEligibility({ birthYear: 2007, country: "ZA" }, now)).toEqual({ ok: true });
  });
  it.each([
    [2013, "NO"],
    [2008, "ZA"],
  ])("requires birthday confirmation in the boundary year %s/%s", (birthYear, country) => {
    expect(ageEligibility({ birthYear, country }, now)).toEqual({ ok: false, reason: "confirm" });
    expect(ageEligibility({ birthYear, country, ageReached: true }, now)).toEqual({ ok: true });
  });
  it.each([
    {},
    { birthYear: 2000 },
    { birthYear: 2000, country: "" },
    { birthYear: 2027, country: "NO" },
    { birthYear: 2000.5, country: "NO" },
    { birthYear: "2000", country: "NO" },
    { birthYear: 1800, country: "NO" },
  ])("refuses malformed declarations", (raw) => {
    expect(ageEligibility(raw, now)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("the age step's outcome for a client", () => {
  it("reads success, deletion below the minimum age, and a retry", () => {
    expect(ageStepOutcome(null)).toEqual({ kind: "confirmed" });
    expect(ageStepOutcome({ code: "age_under_minimum", details: { reason: "under18ZA" } })).toEqual(
      { kind: "deleted", reason: "under18ZA" },
    );
    expect(ageStepOutcome({ code: "age_under_minimum" })).toEqual({
      kind: "deleted",
      reason: "under13",
    });
    expect(ageStepOutcome({ code: "age_invalid", details: { reason: "confirm" } })).toEqual({
      kind: "retry",
      reason: "confirm",
    });
    expect(ageStepOutcome({ code: "age_invalid" })).toEqual({ kind: "retry", reason: "invalid" });
    expect(ageStepOutcome({ code: "internal" })).toEqual({ kind: "retry", reason: "generic" });
  });
});
