import { describe, expect, it } from "vitest";

import { createI18n, flattenKeys, resources } from "./index.ts";

describe("locales", () => {
  it("nb carries every key en has, and nothing else", () => {
    const en = flattenKeys(resources.en.translation).sort();
    const nb = flattenKeys(resources.nb.translation).sort();
    expect(nb).toEqual(en);
  });

  it("no value is empty", () => {
    for (const lang of ["en", "nb"] as const) {
      const walk = (o: unknown, path: string) => {
        if (typeof o === "string") expect(o.trim(), path).not.toBe("");
        else
          for (const [k, v] of Object.entries(o as Record<string, unknown>))
            walk(v, `${path}.${k}`);
      };
      walk(resources[lang].translation, lang);
    }
  });

  it("interpolates and pluralises", () => {
    const en = createI18n("en");
    expect(en.t("lesson.progress", { done: 2, total: 5 })).toBe("2 of 5");
    const nb = createI18n("nb");
    expect(nb.t("gamification.streak", { count: 1 })).toBe("1 dag på rad");
    expect(nb.t("gamification.streak", { count: 3 })).toBe("3 dager på rad");
  });
});
