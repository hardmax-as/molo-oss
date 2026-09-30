import { existsSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "./repo-paths.ts";

/**
 * Loads the wasm-bindgen build of xh-morph (`crates/xh-morph/pkg`, built by
 * the command in that crate's README). Exposes `generate` and
 * `canGeneratePlural`. The WASM refuses classes that are not tutor-validated,
 * so today every `canGeneratePlural` answer is false; that is correct.
 */
export interface Morph {
  generate(lemma: string, cls: string, form: string): string;
  canGeneratePlural(lemma: string, cls: string): boolean;
  ruleTableJson(): string;
}

interface WasmModule {
  default: (input?: { module_or_path: ArrayBuffer }) => Promise<unknown>;
  generate: (lemma: string, cls: string, form: string) => string;
  can_generate_plural: (lemma: string, cls: string) => boolean;
  rule_table_json: () => string;
}

let cached: Morph | null = null;

export function morphPkgDir(): string {
  return join(repoRoot(), "crates", "xh-morph", "pkg");
}

export async function loadMorph(): Promise<Morph | null> {
  if (cached) return cached;
  const dir = morphPkgDir();
  const js = join(dir, "xh_morph.js");
  const wasm = join(dir, "xh_morph_bg.wasm");
  if (!existsSync(js) || !existsSync(wasm)) return null;
  const mod = (await import(js)) as WasmModule;
  await mod.default({ module_or_path: await Bun.file(wasm).arrayBuffer() });
  cached = {
    generate: (l, c, f) => mod.generate(l, c, f),
    canGeneratePlural: (l, c) => mod.can_generate_plural(l, c),
    ruleTableJson: () => mod.rule_table_json(),
  };
  return cached;
}

export const MORPH_BUILD_HINT =
  "xh-morph WASM not built. From the repo root:\n" +
  "  cargo build --release -p xh-morph --target wasm32-unknown-unknown --features wasm\n" +
  "  wasm-bindgen --target web --out-dir crates/xh-morph/pkg target/wasm32-unknown-unknown/release/xh_morph.wasm";
