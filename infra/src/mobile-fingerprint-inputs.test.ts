import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { mobileRoot } from "./mobile-command.ts";

/**
 * Expo's fingerprint hashes every file apps/mobile/app.config.js requires.
 * When the config read the whole en.json/nb.json for one permission prompt,
 * every UI copy change looked native and the production OTA channel was
 * skipped for every merge after 1.0.2. The config may read the native strings
 * file only.
 */
describe("mobile fingerprint inputs", () => {
  const config = readFileSync(join(mobileRoot, "app.config.js"), "utf8");

  it("the app config reads the native strings file", () => {
    expect(config).toContain("packages/i18n/src/native/permissions.json");
  });

  it("the app config never reads the UI locale files", () => {
    expect(config).not.toMatch(/i18n\/src\/locales\//);
  });
});
