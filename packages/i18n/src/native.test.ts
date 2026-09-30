import { describe, expect, it } from "vitest";

import native from "./native/permissions.json";

/**
 * The strings the native app shell needs (iOS permission prompts) live apart
 * from the UI locales, so UI copy never changes the mobile fingerprint
 * (infra/src/mobile-fingerprint-inputs.test.ts guards the app config side).
 */
describe("native strings", () => {
  it("has every native string in en and nb, none empty", () => {
    expect(Object.keys(native.nb).sort()).toEqual(Object.keys(native.en).sort());
    for (const lang of ["en", "nb"] as const)
      for (const [key, value] of Object.entries(native[lang]))
        expect(value.trim(), `${lang}.${key}`).not.toBe("");
  });
});
