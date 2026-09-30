import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The loops are not under test, and the unit project has no `~` alias: stand still.
vi.mock("~/lib/motion.ts", () => ({
  useLoop: () => ({ ref: { current: null }, live: false }),
  useWaveMotion: () => ({ current: null }),
  useMotionPrefs: () => ({ reduced: true }),
}));

import { Crane } from "./Crane.tsx";
import { Penguin } from "./Penguin.tsx";
import { Sunbird } from "./Sunbird.tsx";
import {
  DARK_RIM_FILTER,
  RIM_COLOUR,
  RIM_PX,
  surfaceProps,
  type MascotSurface,
} from "./surface.ts";

type Bird = FunctionComponent<{ pose?: "cheer"; size?: number; surface?: MascotSurface }>;
const BIRDS: [string, Bird][] = [
  ["penguin", Penguin as Bird],
  ["sunbird", Sunbird as Bird],
  ["crane", Crane as Bird],
];

const draw = (Bird: Bird, surface?: MascotSurface) =>
  renderToStaticMarkup(
    createElement(Bird, { pose: "cheer", size: 132, ...(surface ? { surface } : {}) }),
  );

describe("mascots on a dark surface (web)", () => {
  it.each(BIRDS)("the %s carries the cream rim on the indigo sky", (_, Bird) => {
    const html = draw(Bird, "dark");
    expect(html).toContain("drop-shadow");
    expect(html.toLowerCase()).toContain(RIM_COLOUR.toLowerCase());
  });

  it.each(BIRDS)("the %s has no rim on a light surface, the default", (_, Bird) => {
    expect(draw(Bird, "light")).not.toContain("drop-shadow");
    expect(draw(Bird)).not.toContain("drop-shadow");
  });

  it("keeps the drawing itself: the same shapes and colours with or without the rim", () => {
    const shapes = (html: string) => html.replace(/<svg[^>]*>/, "");
    expect(shapes(draw(Penguin as Bird, "dark"))).toBe(shapes(draw(Penguin as Bird, "light")));
  });

  it("dilates the silhouette evenly: one hard shadow per side, no blur", () => {
    expect(surfaceProps("light")).toEqual({});
    expect(surfaceProps("dark")).toEqual({ style: { filter: DARK_RIM_FILTER } });
    const shadows = DARK_RIM_FILTER.match(/drop-shadow\([^)]*\)/g) ?? [];
    expect(shadows).toHaveLength(4);
    for (const s of shadows) expect(s).toMatch(new RegExp(`${RIM_PX}px`));
    for (const s of shadows) expect(s).toMatch(/ 0 #/);
  });
});
