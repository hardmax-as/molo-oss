import { applyAnswer, orderQueue, type MistakeItem } from "./mistakes-queue.ts";

const item = (lexemeId: string, timesWrong: number, lastWrongAt: string): MistakeItem => ({
  lexemeId,
  exerciseType: "listen_select",
  timesWrong,
  lastWrongAt,
});

describe("mistakes queue", () => {
  it("serves the most-missed word first, oldest miss breaking the tie", () => {
    const queue = orderQueue([
      item("b", 1, "2026-09-02T00:00:00.000Z"),
      item("c", 3, "2026-09-04T00:00:00.000Z"),
      item("a", 1, "2026-09-01T00:00:00.000Z"),
    ]);
    expect(queue.map((m) => m.lexemeId)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate the list it is given", () => {
    const input = [
      item("a", 1, "2026-09-01T00:00:00.000Z"),
      item("b", 2, "2026-09-01T00:00:00.000Z"),
    ];
    orderQueue(input);
    expect(input.map((m) => m.lexemeId)).toEqual(["a", "b"]);
  });

  it("takes a word out of the session whatever the answer, and reports a clear only for a right one", () => {
    const queue = [
      item("a", 1, "2026-09-01T00:00:00.000Z"),
      item("b", 1, "2026-09-02T00:00:00.000Z"),
    ];
    const right = applyAnswer(queue, "a", true);
    expect(right.cleared).toBe(true);
    expect(right.queue.map((m) => m.lexemeId)).toEqual(["b"]);

    const wrong = applyAnswer(queue, "a", false);
    expect(wrong.cleared).toBe(false);
    expect(wrong.queue.map((m) => m.lexemeId)).toEqual(["b"]);
  });

  it("clears nothing for a word that is not in the queue", () => {
    expect(applyAnswer([], "gone", true)).toEqual({ queue: [], cleared: false });
  });
});
