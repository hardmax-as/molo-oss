/**
 * Thin TypeScript wrapper over the xh-fsrs WASM (crates/xh-fsrs, wrapping
 * fsrs-rs). The scheduler is never re-implemented in TypeScript
 * (the project rules non-negotiable 6); this file only marshals JSON.
 *
 * Loading is environment-specific and left to the caller: Workers import
 * the `.wasm` as a `WebAssembly.Module`, Bun and Node read the bytes from
 * disk (see `fsrs-node.ts`). Both hand the result to `createFsrs`.
 */

import {
  default_parameters,
  initSync,
  new_card,
  next_state,
} from "../../../crates/xh-fsrs/pkg/xh_fsrs.js";

export const CARD_STATES = ["new", "learning", "review", "relearning"] as const;
export type CardState = (typeof CARD_STATES)[number];

/** Ratings as FSRS defines them: 1 again, 2 hard, 3 good, 4 easy. */
export type Rating = 1 | 2 | 3 | 4;

/** The FSRS part of a `review_cards` row, timestamps in Unix milliseconds. Mirrors `xh_fsrs::Card`. */
export interface FsrsCard {
  readonly stability: number;
  readonly difficulty: number;
  readonly due_at_ms: number;
  readonly last_review_at_ms: number | null;
  readonly reps: number;
  readonly lapses: number;
  readonly state: CardState;
}

/** Mirrors `xh_fsrs::NextState`: the card after one review. */
export interface NextState {
  readonly stability: number;
  readonly difficulty: number;
  readonly due_at_ms: number;
  readonly last_review_at_ms: number;
  readonly reps: number;
  readonly lapses: number;
  readonly state: CardState;
}

export interface Fsrs {
  newCard(): FsrsCard;
  nextState(card: FsrsCard, rating: Rating, nowMs: number, params?: readonly number[]): NextState;
  defaultParameters(): number[];
}

let initialised = false;

/**
 * Instantiates the WASM once per isolate and returns the typed API.
 * `module` is a compiled `WebAssembly.Module` (Workers) or the raw bytes.
 */
export function createFsrs(module: WebAssembly.Module | ArrayBuffer | ArrayBufferView): Fsrs {
  if (!initialised) {
    initSync({ module });
    initialised = true;
  }
  return {
    newCard: () => JSON.parse(new_card()) as FsrsCard,
    nextState: (card, rating, nowMs, params) =>
      JSON.parse(
        next_state(JSON.stringify(card), rating, nowMs, params ? JSON.stringify(params) : null),
      ) as NextState,
    defaultParameters: () => JSON.parse(default_parameters()) as number[],
  };
}

export function isRating(n: unknown): n is Rating {
  return n === 1 || n === 2 || n === 3 || n === 4;
}
