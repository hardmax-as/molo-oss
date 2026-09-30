import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, found by walking up from this file to `Cargo.toml`. */
export function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "Cargo.toml")) && existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  throw new Error(
    "could not locate the repository root (no Cargo.toml + package.json above the CLI)",
  );
}

/** Where Rust binaries are looked for: MOLO_BIN_DIR, then target/release. */
export function binDir(): string {
  return process.env["MOLO_BIN_DIR"] ?? join(repoRoot(), "target", "release");
}

export function binPath(name: string): string {
  return join(binDir(), name);
}
