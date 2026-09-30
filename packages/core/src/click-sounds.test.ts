import { describe, expect, it } from "vitest";

import { CLICK_SOUNDS, clickSoundById } from "./click-sounds.ts";
import { CLICKS } from "./content.ts";

describe("CLICK_SOUNDS", () => {
  it("covers every click letter once, in the drills' order", () => {
    expect(CLICK_SOUNDS.map((c) => c.letter)).toEqual([...CLICKS]);
  });

  it("has fifteen unique, well-formed ids", () => {
    const ids = CLICK_SOUNDS.map((c) => c.id);
    expect(ids).toHaveLength(15);
    expect(new Set(ids).size).toBe(15);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("names the base click the letter is built on", () => {
    for (const c of CLICK_SOUNDS) expect(c.letter).toContain(c.base);
  });

  it("finds a click by id and nothing else", () => {
    expect(clickSoundById(CLICK_SOUNDS[5]!.id)?.letter).toBe("qh");
    expect(clickSoundById("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });
});
