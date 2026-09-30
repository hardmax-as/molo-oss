import type * as BundledLicences from "./licences.ts";

describe("offline licences", () => {
  it("loads attribution in both languages and complete library notices with no connection", () => {
    const fetch = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      const { attributions, libraries } = require("./licences.ts") as typeof BundledLicences;
      expect(attributions.markdown.en).toContain("Pronunciation by Forvo");
      expect(attributions.markdown.nb).toContain("CC BY-SA 4.0");
      const react = libraries.libraries.find((library) => library.name === "react-native")!;
      expect(
        react.notices.some((notice) => notice.text.includes("Permission is hereby granted")),
      ).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
