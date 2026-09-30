import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertBuildStamp } from "./assert-web-artifacts.ts";

describe("assertBuildStamp", () => {
  const dirs: string[] = [];
  const bundle = (buildJson: string | null, chunk: string) => {
    const dir = mkdtempSync(join(tmpdir(), "molo-stamp-"));
    dirs.push(dir);
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "edit-abc.js"), chunk);
    if (buildJson !== null) writeFileSync(join(dir, "build.json"), buildJson);
    return dir;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("passes when build.json names the build a client chunk carries", async () => {
    expect(
      await assertBuildStamp(
        bundle('{"build":"molo-build-zz-sha"}', 'const b="molo-build-zz-sha";'),
      ),
    ).toBe("molo-build-zz-sha");
  });
  it("refuses a missing file, an empty id, or an id no chunk carries", async () => {
    await expect(assertBuildStamp(bundle(null, ""))).rejects.toThrow(/missing/);
    await expect(assertBuildStamp(bundle('{"build":""}', ""))).rejects.toThrow(/names no build/);
    await expect(
      assertBuildStamp(bundle('{"build":"zz-new"}', 'const b="zz-old";')),
    ).rejects.toThrow(/no client chunk/);
  });
});
