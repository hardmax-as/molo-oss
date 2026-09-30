import { describe, expect, it } from "vitest";

import { loadFsrsFromDisk } from "./fsrs-node.ts";

describe("xh-fsrs wasm", () => {
  it("loads, exposes 21 default parameters, and grows stability on rating 4", () => {
    const fsrs = loadFsrsFromDisk();
    expect(fsrs.defaultParameters()).toHaveLength(21);
    let card = fsrs.newCard();
    expect(card.state).toBe("new");
    let now = 1_700_000_000_000;
    let last = 0;
    for (let i = 0; i < 10; i++) {
      const next = fsrs.nextState(card, 4, now);
      expect(next.stability).toBeGreaterThanOrEqual(last);
      expect(next.reps).toBe(i + 1);
      last = next.stability;
      now = Math.max(next.due_at_ms, now + 86_400_000);
      card = { ...card, ...next };
    }
    expect(card.state).toBe("review");
  });

  it("rating 1 on a review card counts a lapse and goes to relearning", () => {
    const fsrs = loadFsrsFromDisk();
    let card = fsrs.newCard();
    let now = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) {
      const next = fsrs.nextState(card, 3, now);
      card = { ...card, ...next };
      now = Math.max(next.due_at_ms, now + 86_400_000);
    }
    const lapsed = fsrs.nextState(card, 1, now);
    expect(lapsed.lapses).toBe(card.lapses + 1);
    expect(lapsed.state).toBe("relearning");
  });
});
