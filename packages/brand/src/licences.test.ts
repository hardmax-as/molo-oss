import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { checkLicences } from "../../../scripts/generate-licences.ts";
import attributions from "../generated/attributions.json";
import mobile from "../generated/libraries.mobile.json";
import web from "../generated/libraries.web.json";
import { inline } from "./legal-markdown.ts";

describe("bundled legal material", () => {
  it("must be regenerated after a lockfile, manifest, source notice or generator change", async () => {
    await checkLicences();
  });

  it.each(["en", "nb"] as const)("ships the exact %s Markdown source", async (lang) => {
    expect(attributions.markdown[lang]).toBe(
      await readFile(new URL(`../legal/attributions.${lang}.md`, import.meta.url), "utf8"),
    );
    for (const source of [
      "https://isixhosa.click/",
      "https://forvo.com/",
      "10.23695/xrsg-mp07",
      "20.500.12185/314",
      "https://creativecommons.org/licenses/by/2.5/za/",
    ])
      expect(attributions.markdown[lang]).toContain(source);
  });

  it.each([
    ["web", web],
    ["mobile", mobile],
  ] as const)(
    "covers %s direct production dependencies and excludes workspace packages",
    async (app, data) => {
      const manifest = JSON.parse(
        await readFile(new URL(`../../../apps/${app}/package.json`, import.meta.url), "utf8"),
      );
      const names = new Set(data.libraries.map((library) => library.name));
      for (const [name, version] of Object.entries(manifest.dependencies)) {
        if (!String(version).startsWith("workspace:")) expect(names.has(name), name).toBe(true);
      }
      expect(names.has("license-checker-rseidelsohn")).toBe(false);
      for (const library of data.libraries) {
        expect(library.name).not.toMatch(/^@molo\//);
        expect(library.licence).not.toMatch(/UNKNOWN|UNLICENSED/);
        expect(library.notices.length).toBeGreaterThan(0);
        expect(
          library.notices.some((notice) => notice.text.length > 200),
          library.name,
        ).toBe(true);
      }
      const react = data.libraries.find((library) => library.name === "react")!;
      expect(
        react.notices.some((notice) => notice.text.includes("Permission is hereby granted")),
      ).toBe(true);
    },
  );

  it("shares safe inline links and renders unsafe Markdown as text", () => {
    expect(inline("[source](https://example.com) **credit**")).toEqual([
      { label: "source", href: "https://example.com" },
      " ",
      { b: "credit" },
    ]);
    expect(inline("[bad](javascript:alert) [bad](//example.com)")).toEqual([
      "[bad](javascript:alert)",
      " ",
      "[bad](//example.com)",
    ]);
  });
});
