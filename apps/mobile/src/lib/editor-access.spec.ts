import { canReview } from "./editor-access.ts";

describe("editor tab and route gate", () => {
  it.each([["editor"], ["admin"], ["learner", "editor"]])("shows the tab for %j", (...roles) => {
    expect(canReview({ roles })).toBe(true);
  });
  it("hides it for learners, guests and while the session is loading", () => {
    expect(canReview({ roles: ["learner"] })).toBe(false);
    expect(canReview({ roles: [] })).toBe(false);
    expect(canReview(null)).toBe(false);
    expect(canReview(undefined)).toBe(false);
  });
});
