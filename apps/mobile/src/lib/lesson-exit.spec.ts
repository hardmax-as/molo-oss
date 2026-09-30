import { mustConfirmExit } from "./lesson-exit.ts";

describe("leaving a lesson (audit M06)", () => {
  it("does not ask before the first exercise is done", () => {
    expect(mustConfirmExit({ done: 0, finished: false })).toBe(false);
  });
  it("asks once an exercise is done", () => {
    expect(mustConfirmExit({ done: 1, finished: false })).toBe(true);
  });
  it("does not ask once the lesson is over", () => {
    expect(mustConfirmExit({ done: 5, finished: true })).toBe(false);
  });
  it("does not ask while hearts have paused the lesson", () => {
    expect(mustConfirmExit({ done: 3, finished: false, paused: true })).toBe(false);
  });
});
