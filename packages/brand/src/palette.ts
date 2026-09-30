/**
 * The shared colour values (docs/DESIGN.md "Colour"). The web app reads its
 * copy from `apps/web/src/styles.css` (@theme) and the mobile app from
 * `apps/mobile/src/ui/theme.ts` and `apps/mobile/tailwind.config.js`: CSS and
 * NativeWind cannot import this file, so `palette.test.ts` keeps all three in
 * step with it and checks every text and control pair against WCAG AA.
 *
 * The identities stay: c is sea, x is sun, q is coral. The base swatches are
 * for fills, borders, bars and illustration. Text and filled controls with
 * white text use the darker roles:
 *
 * - `*Deep` (sea, coral, ochre): a filled face under white text, and text on
 *   white, sand and the soft tints. At least 4.5:1 in each case.
 * - `sunText`: the x click and any sun-coloured text on a light surface.
 *   `sunDeep` stays the pressable edge of a sun button, not a text colour.
 * - `*Edge`: the 3 px pressable edge under a `*Deep` face. Decorative.
 */
export const palette = {
  sun: "#F6B73C",
  sunDeep: "#D99A1C",
  sunText: "#8A5A00",
  sunSoft: "#FFF0C9",
  ochre: "#D9772B",
  ochreDeep: "#9C4F14",
  ochreEdge: "#733A0E",
  indigo: "#26264F",
  sea: "#1FA38C",
  seaDeep: "#11705F",
  seaEdge: "#0A4D41",
  seaSoft: "#D7F3EC",
  coral: "#E85D5D",
  coralDeep: "#B53C3C",
  coralEdge: "#8A2C2C",
  coralSoft: "#FDE2E2",
  sand: "#FFF7E8",
  cloud: "#FFFFFF",
  ink: "#1E1E2A",
  mist: "#66667F",
} as const;

export type PaletteKey = keyof typeof palette;
