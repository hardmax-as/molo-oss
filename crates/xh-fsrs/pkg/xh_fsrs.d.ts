/* tslint:disable */
/* eslint-disable */

/**
 * The fsrs-rs default parameters as a JSON array.
 */
export function default_parameters(): string;

/**
 * A fresh card as JSON, so callers do not hand-write the shape.
 */
export function new_card(): string;

/**
 * `next_state(card_json, rating, now_ms, params_json?) -> next_state_json`.
 * `params_json` is a JSON array of f32 or null/undefined for the defaults.
 */
export function next_state(card_json: string, rating: number, now_ms: number, params_json?: string | null): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly next_state: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly default_parameters: () => [number, number];
    readonly new_card: () => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
