import {
  EMPTY_STUDIO_SESSION,
  itemKey,
  markRecorded,
  moveBy,
  parseStudioSession,
  positionOf,
  remainingItems,
  takeMatches,
  unitTitleKeyFor,
  type StudioSessionState,
} from "./studio-session.ts";

const items = ["a", "b", "c", "d"].map((id) => ({ kind: "lexeme", id }));
const started: StudioSessionState = { ...EMPTY_STUDIO_SESSION, speakerId: "s", started: true };

describe("phone studio session", () => {
  it("Skip and Back move one item and clamp at the ends", () => {
    const one = moveBy(items, started, 1);
    expect(positionOf(items, one)).toBe(1);
    expect(one.currentKey).toBe("lexeme:b");
    const back = moveBy(items, one, -1);
    expect(positionOf(items, back)).toBe(0);
    expect(positionOf(items, moveBy(items, back, -1))).toBe(0);
    let end = started;
    for (let i = 0; i < 10; i++) end = moveBy(items, end, 1);
    expect(positionOf(items, end)).toBe(3);
  });

  it("finds the remembered item after the list is refetched in another order", () => {
    const state = { ...started, currentKey: "lexeme:c", index: 2 };
    const reordered = [items[2]!, items[0]!, items[3]!];
    expect(positionOf(reordered, state)).toBe(0);
  });

  it("falls back to the same slot when the remembered item has gone", () => {
    const state = { ...started, currentKey: "lexeme:zz", index: 2 };
    expect(positionOf(items, state)).toBe(2);
    expect(positionOf(items.slice(0, 1), state)).toBe(0);
    expect(positionOf([], state)).toBe(-1);
  });

  it("an accepted take counts once and the slot moves on to the next item", () => {
    const at = moveBy(items, started, 1); // on b
    const after = markRecorded(items, at, "lexeme:b");
    expect(after.recorded).toEqual(["lexeme:b"]);
    const left = remainingItems(items, after);
    expect(left.map((i) => i.id)).toEqual(["a", "c", "d"]);
    expect(left[positionOf(left, after)]?.id).toBe("c");
    expect(markRecorded(left, after, "lexeme:b").recorded).toEqual(["lexeme:b"]);
  });

  it("recording the last item leaves the previous one on screen", () => {
    const last = { ...started, currentKey: "lexeme:d", index: 3 };
    const after = markRecorded(items, last, "lexeme:d");
    const left = remainingItems(items, after);
    expect(left[positionOf(left, after)]?.id).toBe("c");
  });

  it("a take is bound to the item it was recorded for", () => {
    expect(takeMatches(itemKey(items[0]!), items[0]!)).toBe(true);
    expect(takeMatches(itemKey(items[0]!), items[1]!)).toBe(false);
    expect(takeMatches(null, items[0]!)).toBe(false);
  });

  it("names a unit by its title key, never guessing one from the slug (MOL-67)", () => {
    const units = [{ slug: "greet-and-introduce", titleKey: "curriculum.units.greet.title" }];
    expect(unitTitleKeyFor("greet-and-introduce", units)).toBe("curriculum.units.greet.title");
    expect(unitTitleKeyFor("other", units)).toBeNull();
    expect(unitTitleKeyFor("other", undefined)).toBeNull();
  });

  it("restores a persisted session and rejects anything malformed", () => {
    const state = markRecorded(items, moveBy(items, started, 1), "lexeme:b");
    expect(parseStudioSession(JSON.stringify(state))).toEqual(state);
    expect(parseStudioSession(null)).toBeNull();
    expect(parseStudioSession("{")).toBeNull();
    expect(parseStudioSession(JSON.stringify({ ...state, recorded: [1] }))).toBeNull();
    expect(parseStudioSession(JSON.stringify({ speakerId: "s" }))).toBeNull();
  });
});
