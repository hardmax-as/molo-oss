import { accountReady, showAgeStep, submitAgeStep } from "./age-step.ts";
import type { Me } from "./api.ts";

const me = (ageRequired?: boolean) =>
  ({
    user: { id: "u", name: "Fixture", email: "fixture@molo.local" },
    roles: ["learner"],
    sourceLang: "en",
    ...(ageRequired === undefined ? {} : { ageRequired }),
  }) as Me;

function ports(refusal?: { code: string; details?: unknown }) {
  return {
    confirm: jest.fn(async () => {
      if (refusal) throw Object.assign(new Error(refusal.code), refusal);
      return { ageRequired: false };
    }),
    afterConfirmed: jest.fn(async () => undefined),
  };
}

const adult = { birthYear: 1990, country: "NO", ageReached: false };

describe("the mobile age step", () => {
  it("shows only for an account that owes it, and holds syncing back until then", () => {
    expect(showAgeStep(me(true))).toBe(true);
    expect(showAgeStep(me(false))).toBe(false);
    expect(showAgeStep(me())).toBe(false);
    expect(showAgeStep(null)).toBe(false);
    expect(accountReady(me(true))).toBe(false);
    expect(accountReady(me(false))).toBe(true);
    expect(accountReady(null)).toBe(false);
  });

  it("confirms an adult and then runs what waited for the account", async () => {
    const p = ports();
    await expect(submitAgeStep(adult, p)).resolves.toEqual({ kind: "confirmed" });
    expect(p.confirm).toHaveBeenCalledWith(adult);
    expect(p.afterConfirmed).toHaveBeenCalledTimes(1);
  });

  it("fixes empty input and the unconfirmed boundary year without a request", async () => {
    const p = ports();
    await expect(
      submitAgeStep({ birthYear: 0, country: "", ageReached: false }, p),
    ).resolves.toEqual({ kind: "retry", reason: "invalid" });
    const boundary = {
      birthYear: new Date().getUTCFullYear() - 13,
      country: "NO",
      ageReached: false,
    };
    await expect(submitAgeStep(boundary, p)).resolves.toEqual({ kind: "retry", reason: "confirm" });
    expect(p.confirm).not.toHaveBeenCalled();
  });

  it("sends an under-age answer so the server deletes the account, and reports the deletion", async () => {
    const p = ports({ code: "age_under_minimum", details: { reason: "under18ZA" } });
    const young = { birthYear: new Date().getUTCFullYear() - 16, country: "ZA", ageReached: true };
    await expect(submitAgeStep(young, p)).resolves.toEqual({
      kind: "deleted",
      reason: "under18ZA",
    });
    expect(p.confirm).toHaveBeenCalledWith(young);
    expect(p.afterConfirmed).not.toHaveBeenCalled();
  });

  it("offers a retry when the request fails for any other reason", async () => {
    const p = ports({ code: "http" });
    await expect(submitAgeStep(adult, p)).resolves.toEqual({ kind: "retry", reason: "generic" });
    expect(p.afterConfirmed).not.toHaveBeenCalled();
  });
});
