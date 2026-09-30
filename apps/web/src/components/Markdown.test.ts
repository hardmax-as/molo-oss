import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { Markdown } from "./Markdown.tsx";

it("makes the legal form and official source links usable", () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      source: "[Form](/withdrawal-form) and [Source](https://example.com/form)",
    }),
  );
  expect(html).toContain('href="/withdrawal-form"');
  expect(html).toContain('href="https://example.com/form"');
});
it("does not turn unsupported protocols or raw HTML into executable links", () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, { source: "[Bad](javascript:alert(1)) <script>alert(1)</script>" }),
  );
  expect(html).not.toContain("href=");
  expect(html).not.toContain("<script>");
});
