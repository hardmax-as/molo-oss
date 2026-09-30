/* tslint:disable */
/* eslint-disable */

/**
 * `can_generate_plural(lemma, class)`: true only when the class is
 * `validated = true` in the rule table and generation succeeds.
 */
export function can_generate_plural(lemma: string, _class: string): boolean;

/**
 * `generate(lemma, class, form)` where `form` is one of
 * `plural | singular | subject_concord | object_concord | possessive | locative`
 * (the locative always rejects: no rule yet).
 * Rejects with the `MorphError` message on failure.
 */
export function generate(lemma: string, _class: string, form: string): string;

/**
 * The built-in rule table as JSON (`{ schema_version, class: [...] }`),
 * for the editor dashboard and the database seed.
 */
export function rule_table_json(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly generate: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly can_generate_plural: (a: number, b: number, c: number, d: number) => number;
    readonly rule_table_json: () => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
