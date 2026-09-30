import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { assertNoServedMaps } from "./assert-web-artifacts.ts";
import { sentryBuildOptions } from "./sentry-build.ts";

const release = "a".repeat(40);
const fixture = { MOLO_LIVE: "1", SENTRY_AUTH_TOKEN: "test-only-fixture", SENTRY_RELEASE: release };
it("skips all upload/release creation without a token or the live deploy gate", () => {
  for (const project of ["molo-web", "molo-api"] as const) {
    expect(sentryBuildOptions(project, { ...fixture, SENTRY_AUTH_TOKEN: "" })).toBeUndefined();
    expect(sentryBuildOptions(project, { ...fixture, MOLO_LIVE: "0" })).toBeUndefined();
    expect(sentryBuildOptions(project, {})).toBeUndefined();
  }
});
it("uses one full SHA and EU organization for both projects, deleting only web artifacts", () => {
  const web = sentryBuildOptions("molo-web", fixture)!;
  const api = sentryBuildOptions("molo-api", fixture)!;
  expect(web).toMatchObject({
    project: "molo-web",
    org: "malmo-development",
    url: "https://de.sentry.io",
    telemetry: false,
    release: { name: release },
  });
  expect(api).toMatchObject({ project: "molo-api", release: web.release, url: web.url });
  expect(web.sourcemaps?.filesToDeleteAfterUpload).toEqual(["./dist/**/*.map"]);
  expect(api.sourcemaps?.filesToDeleteAfterUpload).toBeUndefined();
  expect(() => sentryBuildOptions("molo-web", { ...fixture, SENTRY_RELEASE: "main" })).toThrow(
    "SHA",
  );
});
it("refuses even a nested map in the served bundle", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molo-served-maps-"));
  try {
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "assets/app.js"), "fixture");
    await expect(assertNoServedMaps(dir)).resolves.toBeUndefined();
    await writeFile(join(dir, "assets/app.js.map"), "{}");
    await expect(assertNoServedMaps(dir)).rejects.toThrow("source map remains");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
