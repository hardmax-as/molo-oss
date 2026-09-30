/**
 * Bun / Node loader: reads the committed wasm-bindgen output from
 * crates/xh-fsrs/pkg. Not for Workers (they import the .wasm as a module).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createFsrs, type Fsrs } from "./fsrs.ts";

let cached: Fsrs | null = null;

export function loadFsrsFromDisk(): Fsrs {
  if (cached) return cached;
  const path = fileURLToPath(
    new URL("../../../crates/xh-fsrs/pkg/xh_fsrs_bg.wasm", import.meta.url),
  );
  cached = createFsrs(readFileSync(path));
  return cached;
}
