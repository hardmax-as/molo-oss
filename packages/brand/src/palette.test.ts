import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { colors as mobileColors, clickColors } from "../../../apps/mobile/src/ui/theme.ts";
import { palette, type PaletteKey } from "./palette.ts";

/**
 * WCAG 2.2 contrast, written out here so the check needs no dependency:
 * relative luminance of sRGB, then (lighter + 0.05) / (darker + 0.05).
 * https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 */
function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = Number.parseInt(n.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5; // normal text (1.4.3)
const UI = 3; // large text, focus indicators and control boundaries (1.4.3, 1.4.11)

/** The light surfaces text sits on: cards, the page, and the verdict tints. */
const LIGHT: PaletteKey[] = ["cloud", "sand", "sunSoft", "seaSoft", "coralSoft"];

/** [foreground, background, minimum, where] */
const PAIRS: [PaletteKey, PaletteKey, number, string][] = [
  // Filled controls: buttons, the "Correct!" bar, ratings, editor tabs, chips.
  ["cloud", "seaDeep", TEXT, "white on a sea button or the correct bar"],
  ["cloud", "coralDeep", TEXT, "white on a coral button, rating or chip"],
  ["cloud", "ochreDeep", TEXT, "white on the active editor tab and the ochre unit banner"],
  ["cloud", "sunText", TEXT, "a white x on its click circle"],
  ["indigo", "sun", TEXT, "indigo on the primary sun button"],
  ["ink", "sun", TEXT, "ink on the mobile sun button"],
  // Text roles on every light surface.
  ...(["seaDeep", "coralDeep", "ochreDeep", "sunText", "mist"] as const).flatMap((fg) =>
    LIGHT.map(
      (bg) => [fg, bg, TEXT, `${fg} text on ${bg}`] as [PaletteKey, PaletteKey, number, string],
    ),
  ),
  // The focus ring: indigo outline against the page, sun band against a dark control.
  ["indigo", "sand", UI, "focus outline on the page"],
  ["indigo", "cloud", UI, "focus outline on a card"],
  ["sun", "indigo", UI, "focus band against an indigo control"],
];

describe("palette contrast (WCAG AA)", () => {
  it.each(PAIRS)("%s on %s ≥ %s: %s", (fg, bg, min) => {
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(min);
  });

  it("the contrast function matches known values", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    // The audit's figures for the old pairs (docs/design-audit-2026-09-web.md, W03).
    expect(contrast("#FFFFFF", "#1FA38C")).toBeCloseTo(3.15, 2);
    expect(contrast("#FFFFFF", "#E85D5D")).toBeCloseTo(3.41, 2);
    expect(contrast("#D99A1C", "#FFFFFF")).toBeCloseTo(2.44, 2);
  });

  it("the base swatches stay the identities, and stay too light for white text", () => {
    // Guards against "fixing" contrast by darkening sea, sun or coral themselves.
    expect(palette.sea).toBe("#1FA38C");
    expect(palette.sun).toBe("#F6B73C");
    expect(palette.coral).toBe("#E85D5D");
    for (const k of ["sea", "coral", "sun", "ochre"] as const)
      expect(contrast(palette.cloud, palette[k])).toBeLessThan(TEXT);
  });
});

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe("both apps carry the shared values", () => {
  const css = read("../../../apps/web/src/styles.css");
  const tailwind = read("../../../apps/mobile/tailwind.config.js");

  it.each(Object.entries(palette))("web @theme --color-%s", (key, hex) => {
    const m = css.match(new RegExp(`--color-${kebab(key)}:\\s*(#[0-9a-fA-F]{6});`));
    expect(m?.[1]?.toUpperCase(), `--color-${kebab(key)} in styles.css`).toBe(hex);
  });

  it.each(Object.entries(palette))("mobile theme.ts colors.%s", (key, hex) => {
    expect((mobileColors as Record<string, string>)[key]?.toUpperCase()).toBe(hex);
  });

  it.each(Object.entries(palette))("mobile tailwind.config.js %s", (key, hex) => {
    const name = kebab(key);
    const m = tailwind.match(new RegExp(`(?:"${name}"|\\b${name}):\\s*"(#[0-9a-fA-F]{6})"`));
    expect(m?.[1]?.toUpperCase(), `${name} in tailwind.config.js`).toBe(hex);
  });

  it("click letters use the text shades in both apps", () => {
    expect(clickColors).toEqual({ c: palette.seaDeep, x: palette.sunText, q: palette.coralDeep });
    expect(css).toMatch(/\.click-c\s*\{\s*@apply text-sea-deep;/);
    expect(css).toMatch(/\.click-x\s*\{\s*@apply text-sun-text;/);
    expect(css).toMatch(/\.click-q\s*\{\s*@apply text-coral-deep;/);
  });
});
