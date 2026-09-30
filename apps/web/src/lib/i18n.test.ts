import { describe, expect, it } from "vitest";

import { syncDocumentLang } from "./i18n.tsx";

describe("document language (W09)", () => {
  it("follows the UI language in both directions without a reload", () => {
    const doc = { documentElement: { lang: "en" } };
    syncDocumentLang(doc, "nb");
    expect(doc.documentElement.lang).toBe("nb");
    syncDocumentLang(doc, "en");
    expect(doc.documentElement.lang).toBe("en");
  });

  it("is a no-op without a document (server render)", () => {
    expect(() => syncDocumentLang(undefined, "nb")).not.toThrow();
  });
});
