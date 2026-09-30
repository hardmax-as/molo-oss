#!/usr/bin/env bun
/**
 * Loads the wasm-bindgen output in crates/xh-fsrs/pkg and schedules ten
 * reviews at rating 4, asserting stability never decreases. No dependencies.
 *
 * Build first (see crates/xh-fsrs/README.md):
 *   cargo build --release -p xh-fsrs --target wasm32-unknown-unknown --features wasm
 *   wasm-bindgen --target web --out-dir crates/xh-fsrs/pkg target/wasm32-unknown-unknown/release/xh_fsrs.wasm
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..", "pkg");

type Wasm = {
  default: (input: { module_or_path: WebAssembly.Module | BufferSource }) => Promise<unknown>;
  next_state: (card: string, rating: number, nowMs: number, params?: string) => string;
  default_parameters: () => string;
  new_card: () => string;
};

const mod = (await import(join(pkg, "xh_fsrs.js"))) as Wasm;
const bytes = readFileSync(join(pkg, "xh_fsrs_bg.wasm"));
await mod.default({ module_or_path: bytes });

const params = JSON.parse(mod.default_parameters()) as number[];
if (params.length !== 21) throw new Error(`expected 21 default parameters, got ${params.length}`);

let card = mod.new_card();
let now = 1_700_000_000_000;
let last = 0;
const DAY = 86_400_000;
for (let i = 0; i < 10; i++) {
  const next = JSON.parse(mod.next_state(card, 4, now)) as {
    stability: number;
    due_at_ms: number;
    reps: number;
    state: string;
  };
  if (next.stability < last)
    throw new Error(`review ${i}: stability fell from ${last} to ${next.stability}`);
  if (next.reps !== i + 1) throw new Error(`review ${i}: reps ${next.reps}`);
  console.log(
    `review ${i + 1}: stability ${next.stability.toFixed(2)} d, state ${next.state}, due in ${((next.due_at_ms - now) / DAY).toFixed(1)} d`,
  );
  last = next.stability;
  now = Math.max(next.due_at_ms, now + DAY);
  card = JSON.stringify({
    ...JSON.parse(card),
    ...next,
    last_review_at_ms: next.last_review_at_ms,
  });
}
console.log("xh-fsrs wasm smoke: OK, stability monotone over 10 reviews at rating 4");
