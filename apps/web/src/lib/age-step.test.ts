import { describe, expect, it } from "vitest";

import { accountReady, ageStepBlocks } from "./age-step.ts";
import type { Me } from "./api.ts";

const me = (ageRequired?: boolean) =>
  ({
    user: { id: "u", name: "Fixture", email: "fixture@molo.local" },
    roles: ["learner"],
    ...(ageRequired === undefined ? {} : { ageRequired }),
  }) as Me;

describe("the web age step", () => {
  it.each(["/", "/review", "/learn/greetings/l1", "/settings", "/edit", "/plus", "/leagues"])(
    "puts the step in front of %s while the account owes it",
    (path) => {
      expect(ageStepBlocks(me(true), path)).toBe(true);
    },
  );

  it.each(["/privacy", "/privacy/providers", "/terms/", "/legal/company", "/delete-account"])(
    "leaves %s readable",
    (path) => {
      expect(ageStepBlocks(me(true), path)).toBe(false);
    },
  );

  it("never shows the step to a guest, a confirmed account, or an older server", () => {
    expect(ageStepBlocks(null, "/")).toBe(false);
    expect(ageStepBlocks(undefined, "/")).toBe(false);
    expect(ageStepBlocks(me(false), "/")).toBe(false);
    expect(ageStepBlocks(me(), "/")).toBe(false);
  });

  it("holds background syncing back until the step is done", () => {
    expect(accountReady(me(true))).toBe(false);
    expect(accountReady(me(false))).toBe(true);
    expect(accountReady(me())).toBe(true);
    expect(accountReady(null)).toBe(false);
  });
});
