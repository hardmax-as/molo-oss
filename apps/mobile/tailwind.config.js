/** @type {import('tailwindcss').Config} */
// Tokens from docs/DESIGN.md. Keep this file and src/ui/theme.ts in step.
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        sun: "#F6B73C",
        ochre: "#D9772B",
        indigo: "#26264F",
        sea: "#1FA38C",
        coral: "#E85D5D",
        sand: "#FFF7E8",
        cloud: "#FFFFFF",
        ink: "#1E1E2A",
        // secondary text (5.2:1 on sand); the lighter shade is for icons and dividers only
        mist: "#66667F",
        "mist-soft": "#8A8AA3",
        // darker edges for the pressable bottom-edge look
        "sun-deep": "#D99A1C",
        // text roles (packages/brand/src/palette.ts): 4.5:1 on white, sand and the
        // soft tints, and as a face under white text; `-edge` is the pressable edge
        "sun-text": "#8A5A00",
        "sun-soft": "#FFF0C9",
        "ochre-deep": "#9C4F14",
        "ochre-edge": "#733A0E",
        "sea-deep": "#11705F",
        "sea-edge": "#0A4D41",
        // soft fill behind the piece of a word that agrees (grammar notes)
        "sea-soft": "#D7F3EC",
        "coral-deep": "#B53C3C",
        "coral-edge": "#8A2C2C",
        "coral-soft": "#FDE2E2",
        "indigo-deep": "#161632",
        "cloud-deep": "#E6DCC8",
        "sand-deep": "#F3E3C3",
      },
      fontFamily: {
        display: ["Fredoka_600SemiBold"],
        "display-bold": ["Fredoka_700Bold"],
        body: ["Nunito_400Regular"],
        "body-semibold": ["Nunito_600SemiBold"],
        "body-bold": ["Nunito_700Bold"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};
