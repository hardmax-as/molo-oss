import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { bundle } from "alchemy/esbuild";
import { expect, it } from "vitest";

import { sentryWorkerPlugins } from "./sentry-worker.ts";

it("keeps the real entrypoint discoverable after Sentry injection and retains its private map", async () => {
  const dir = await mkdtemp(join(tmpdir(), "molo-sentry-worker-"));
  try {
    const entryPoint = join(dir, "fixture.ts");
    await writeFile(entryPoint, 'export const run = () => { throw new Error("fixture"); };');
    const result = await bundle({
      entryPoint,
      outdir: join(dir, "out"),
      format: "esm",
      sourcemap: "external",
      plugins: sentryWorkerPlugins({
        telemetry: false,
        authToken: "",
        silent: true,
        // Never create a release or upload from a test, even with credentials in .env.
        release: {
          name: "a".repeat(40),
          create: false,
          finalize: false,
          setCommits: false,
          deploy: false,
        },
        sourcemaps: { disable: "disable-upload" },
      }),
    });
    const outputs = Object.entries(result.metafile!.outputs);
    const entry = outputs.find(([, output]) => output.entryPoint?.endsWith("fixture.ts"));
    expect(entry).toBeDefined();
    expect(entry![1].entryPoint).not.toContain("sentryDebugIdProxy");
    const code = await readFile(entry![0], "utf8");
    expect(code).toContain("_sentryDebugIds");
    expect(code).toContain("a".repeat(40));
    const map = outputs.find(([name]) => name.endsWith(".map"));
    expect(map).toBeDefined();
    expect(JSON.parse(await readFile(map![0], "utf8")).sourcesContent.join("\n")).toContain(
      'Error("fixture")',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
