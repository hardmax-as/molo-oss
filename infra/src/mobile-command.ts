import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { publisherRole } from "./mobile-release-policy.ts";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
export const mobileRoot = join(repoRoot, "apps/mobile");
export const EAS_VERSION = "16.32.0";

export function run(args: string[], cwd = repoRoot, capture = false): string {
  const result = Bun.spawnSync(args, {
    cwd,
    env: process.env,
    stdout: capture ? "pipe" : "inherit",
    stderr: capture ? "pipe" : "inherit",
  });
  if (result.exitCode !== 0) throw new Error(`${args[0]} command failed (exit ${result.exitCode})`);
  return capture ? new TextDecoder().decode(result.stdout).trim() : "";
}

export function eas(args: string[], capture = false): string {
  return run(["bunx", `eas-cli@${EAS_VERSION}`, ...args], mobileRoot, capture);
}

export function checkPublisher() {
  const token = process.env["EXPO_ACCESS_TOKEN"];
  if (!token) throw new Error("EXPO_ACCESS_TOKEN is missing");
  process.env["EXPO_TOKEN"] = token;
  const role = publisherRole(eas(["whoami"], true));
  console.log(`EAS account hardmax: ${role}; publisher preflight passed`);
}

export function summary(message: string) {
  console.log(message);
  const file = process.env["GITHUB_STEP_SUMMARY"];
  if (file) appendFileSync(file, `${message}\n`);
}
