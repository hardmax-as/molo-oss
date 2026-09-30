import { createI18n } from "@molo/i18n";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { GlossSuggestionLine } from "./GlossSuggestionLine.tsx";

function render(
  canonical: string,
  gloss: string,
  lang: "en" | "nb" = "en",
  provenance = "google-translate-v2",
) {
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createI18n(lang) },
      createElement(GlossSuggestionLine, { canonical, suggestion: { provenance, gloss } }),
    ),
  );
}

describe("Google suggestion chip", () => {
  it("agrees using sameGloss normalization, including accents, whitespace and punctuation", () => {
    expect(render("Å komme.", " å komme ")).toContain("Agree");
    expect(render("Å komme.", " å komme ")).toContain("Also suggested by Google Translate:");
  });
  it("marks a differing gloss for slower reading", () => {
    expect(render("å komme", "å gå")).toContain("Differs");
    expect(render("", "å komme")).toContain("Differs");
  });
  it("translates the suggestion and both chips into Norwegian", () => {
    expect(render("å komme", "å komme", "nb")).toContain("Samsvarer");
    expect(render("å komme", "å gå", "nb")).toContain("Avviker");
    expect(render("å komme", "å gå", "nb")).toContain("Også foreslått av Google Translate:");
  });
  it("escapes machine text and never labels another provider as Google", () => {
    expect(render("", "<script>fixture</script>")).toContain("&lt;script&gt;");
    expect(render("", "<script>fixture</script>")).not.toContain("<script>");
    expect(render("word", "word", "en", "another-provider")).toBe("");
  });
});
