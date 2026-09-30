/**
 * docs/DESIGN.md tokens for code that needs raw values (SVG, Reanimated).
 * Mirror of tailwind.config.js; the shared values come from
 * packages/brand/src/palette.ts, and palette.test.ts keeps them in step and
 * checks their contrast. Base swatches fill; `*Deep` and `sunText` are the
 * text and white-text-face roles; `*Edge` is the pressable edge under a deep face.
 */
export const colors = {
  sun: "#F6B73C",
  ochre: "#D9772B",
  indigo: "#26264F",
  sea: "#1FA38C",
  coral: "#E85D5D",
  sand: "#FFF7E8",
  cloud: "#FFFFFF",
  ink: "#1E1E2A",
  /** Secondary text: 5.2:1 on sand, 6.1:1 on cloud. */
  mist: "#66667F",
  /** Icons, dividers and inactive glyphs only; too light for text on sand. */
  mistSoft: "#8A8AA3",
  sunDeep: "#D99A1C",
  /** The x click and any sun-coloured text on a light surface: 5.9:1 on white. */
  sunText: "#8A5A00",
  sunSoft: "#FFF0C9",
  ochreDeep: "#9C4F14",
  ochreEdge: "#733A0E",
  seaDeep: "#11705F",
  seaEdge: "#0A4D41",
  seaSoft: "#D7F3EC",
  coralDeep: "#B53C3C",
  coralEdge: "#8A2C2C",
  coralSoft: "#FDE2E2",
  indigoDeep: "#161632",
  cloudDeep: "#E6DCC8",
  sandDeep: "#F3E3C3",
} as const;

/**
 * Click consonants keep the same colour everywhere (drill, tiles, review
 * cards), in their text shades: each reaches 4.5:1 on white and sand as a
 * letter, and under a white letter as a fill.
 */
export const clickColors: Record<string, string> = {
  c: colors.seaDeep,
  x: colors.sunText,
  q: colors.coralDeep,
};

export const fonts = {
  display: "Fredoka_600SemiBold",
  displayBold: "Fredoka_700Bold",
  body: "Nunito_400Regular",
  bodySemibold: "Nunito_600SemiBold",
  bodyBold: "Nunito_700Bold",
} as const;

/** Motion timings from the spec (ms). */
export const timing = {
  enter: 220,
  stagger: 40,
  press: 90,
  countUp: 800,
} as const;

/** Particle colours for confetti and the level-up ring. */
export const confettiPalette = [colors.sun, colors.sea, colors.coral, colors.ochre, colors.cloud];
