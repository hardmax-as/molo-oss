import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { mobileRoot, repoRoot, run, summary } from "./mobile-command.ts";
import { productionSafe } from "./mobile-release-policy.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { "base-ref": { type: "string" } },
  strict: true,
});
const scratch = mkdtempSync(join(tmpdir(), "molo-mobile-fingerprint-"));
const worktree = join(scratch, "base");
let added = false;
let baseHash: string | null = null;
let headHash: string | null = null;
let safe = false;
let failed = false;
const cli = join(mobileRoot, "node_modules/@expo/fingerprint/bin/cli.js");

function generate(project: string, file: string) {
  const raw = run(
    ["node", cli, "fingerprint:generate", project, "--concurrent-io-limit", "2"],
    project,
    true,
  );
  const parsed: unknown = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("hash" in parsed) ||
    typeof parsed.hash !== "string" ||
    !/^[a-f0-9]{40,64}$/.test(parsed.hash)
  )
    throw new Error("Invalid generated fingerprint");
  writeFileSync(file, raw);
  return parsed.hash;
}

try {
  const headFile = join(scratch, "head.json");
  headHash = generate(mobileRoot, headFile);
  const ref =
    values["base-ref"] ??
    run(["git", "tag", "--list", "mobile/v*", "--sort=-version:refname"], repoRoot, true)
      .split("\n")
      .find((tag) => /^mobile\/v\d+\.\d+\.\d+$/.test(tag));
  if (!ref) {
    safe = productionSafe(null, headHash, null);
    summary(
      "No mobile release tag exists yet; baseline is unknown (allowed by the configured policy).",
    );
  } else {
    if (!/^(?:[a-f0-9]{40}|mobile\/v\d+\.\d+\.\d+)$/.test(ref))
      throw new Error("Invalid fingerprint base reference");
    run(["git", "worktree", "add", "--lock", "--detach", worktree, ref], repoRoot, true);
    added = true;
    run(["bun", "install", "--frozen-lockfile", "--ignore-scripts"], worktree, true);
    const baseFile = join(scratch, "base.json");
    baseHash = generate(join(worktree, "apps/mobile"), baseFile);
    if (baseHash === headHash) safe = true;
    else {
      const diffFile = join(scratch, "diff.json");
      writeFileSync(
        diffFile,
        run(["node", cli, "fingerprint:diff", baseFile, headFile], repoRoot, true),
      );
      safe = productionSafe(baseHash, headHash, JSON.parse(readFileSync(diffFile, "utf8")));
    }
  }
} catch {
  failed = true;
  safe = false;
  summary("Fingerprint generation/classification failed; production OTA is refused.");
} finally {
  if (added) {
    run(["git", "worktree", "unlock", worktree], repoRoot, true);
    run(["git", "worktree", "remove", "--force", worktree], repoRoot, true);
  }
  rmSync(scratch, { recursive: true, force: true });
}
const changed = baseHash !== null && headHash !== null && baseHash !== headHash;
const output = `production_safe=${safe}\nchanged=${changed}\nbase_hash=${baseHash ?? "unknown"}\nhead_hash=${headHash ?? "unknown"}\n`;
if (process.env["GITHUB_OUTPUT"]) appendFileSync(process.env["GITHUB_OUTPUT"], output);
summary(
  `Mobile fingerprint: base \`${baseHash ?? "unknown"}\`, HEAD \`${headHash ?? "unknown"}\`; production_safe=${safe}.`,
);
if (!safe) summary("Production OTA skipped: run Mobile Release Build.");
if (failed) process.exitCode = 1;
