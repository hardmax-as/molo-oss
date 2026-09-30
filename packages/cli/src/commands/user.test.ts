import { describe, expect, it } from "vitest";

import { impliedRoles, parseOlderThan } from "./user.ts";

describe("prune-pending --older-than", () => {
  it("reads whole days, with or without the d", () => {
    expect(parseOlderThan("7d")).toBe(7);
    expect(parseOlderThan("14")).toBe(14);
    expect(parseOlderThan(" 30d ")).toBe(30);
  });

  it("refuses anything that is not a positive number of days", () => {
    for (const bad of ["0d", "-1d", "7h", "1w", "", "7.5d"]) expect(parseOlderThan(bad)).toBeNull();
  });
});

describe("role implication", () => {
  it("admin implies editor and learner", () => {
    expect(impliedRoles("admin")).toEqual(["admin", "editor", "learner"]);
  });
});
