import { PLAY_ACTION, runTileAction, tileAccessibilityActions } from "./tile-a11y.ts";

describe("answer tile accessibility (audit M05)", () => {
  it("offers a named play action only when the tile has a clip", () => {
    expect(tileAccessibilityActions(undefined)).toBeUndefined();
    expect(tileAccessibilityActions({ label: "Listen 2", play: () => {} })).toEqual([
      { name: PLAY_ACTION, label: "Listen 2" },
    ]);
  });

  it("the play action plays the clip and does not choose the tile", () => {
    const play = jest.fn();
    const press = jest.fn();
    runTileAction(PLAY_ACTION, { press, playAction: { label: "Listen 1", play } });
    expect(play).toHaveBeenCalledTimes(1);
    expect(press).not.toHaveBeenCalled();
  });

  it("activate still chooses the tile", () => {
    const press = jest.fn();
    runTileAction("activate", { press });
    expect(press).toHaveBeenCalledTimes(1);
  });
});
