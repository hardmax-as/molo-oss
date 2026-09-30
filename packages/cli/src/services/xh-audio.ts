import { existsSync } from "node:fs";
import { join } from "node:path";

import { AudioManifest } from "@molo/core";
import { Effect, Schema } from "effect";

import { CliError, tryPromise } from "../context.ts";
import { binPath, repoRoot } from "./repo-paths.ts";

const decodeManifest = Schema.decodeUnknownEither(AudioManifest);

/** Finds the `xh-audio` binary, building it with cargo if it is missing (local tool, no --live). */
export function ensureXhAudio(): Effect.Effect<string, CliError> {
  return Effect.gen(function* () {
    const bin = binPath("xh-audio");
    if (existsSync(bin)) return bin;
    console.error(
      `xh-audio not found at ${bin}; building with cargo (this takes a while the first time)`,
    );
    const proc = Bun.spawn(["cargo", "build", "--release", "-p", "xh-audio"], {
      cwd: repoRoot(),
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = yield* tryPromise(() => proc.exited, "cargo build");
    if (code !== 0)
      return yield* Effect.fail(
        new CliError({ message: `cargo build -p xh-audio exited with ${code}` }),
      );
    if (!existsSync(bin))
      return yield* Effect.fail(
        new CliError({ message: `built, but ${bin} still missing (set MOLO_BIN_DIR?)` }),
      );
    return bin;
  });
}

export interface ProcessedAudio {
  readonly manifest: AudioManifest;
  readonly opusPath: string;
  readonly flacPath: string;
  readonly manifestPath: string;
}

/** Runs `xh-audio process <input> <outdir> --json` and returns the validated manifest. */
export function processAudio(
  input: string,
  outdir: string,
): Effect.Effect<ProcessedAudio, CliError> {
  return Effect.gen(function* () {
    const bin = yield* ensureXhAudio();
    const proc = Bun.spawn([bin, "process", input, outdir, "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = yield* tryPromise(
      () =>
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]),
      "xh-audio",
    );
    if (code !== 0)
      return yield* Effect.fail(
        new CliError({ message: `xh-audio exited with ${code}: ${stderr.trim()}` }),
      );
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return yield* Effect.fail(
        new CliError({ message: `xh-audio printed no JSON manifest: ${stdout.slice(0, 200)}` }),
      );
    }
    // `--json` prints a report { manifest, opus_path, flac_path, manifest_path }.
    const report = parsed as {
      manifest?: unknown;
      opus_path?: string;
      flac_path?: string;
      manifest_path?: string;
    };
    const manifest = decodeManifest(report.manifest ?? parsed);
    if (manifest._tag === "Left") {
      return yield* Effect.fail(
        new CliError({
          message: `manifest does not match @molo/core AudioManifest: ${String(manifest.left)}`,
        }),
      );
    }
    const m = manifest.right;
    return {
      manifest: m,
      opusPath: report.opus_path ?? join(outdir, `${m.sha256}.opus`),
      flacPath: report.flac_path ?? join(outdir, `${m.sha256}.flac`),
      manifestPath: report.manifest_path ?? join(outdir, `${m.sha256}.json`),
    };
  });
}
