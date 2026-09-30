/**
 * xh-morph inside the Worker: the wasm-bindgen output is imported as a
 * module and initialised once per isolate. Every answer carries
 * `validated`, which is false for every class until the tutor signs the
 * goldens off; the publish gate treats unvalidated as "cannot generate".
 *
 * The port is asked per target language. isiXhosa maps to this crate; any
 * other language has no generator and therefore no morphology-dependent
 * publishing (ARCHITECTURE section 2.6). There is deliberately no second
 * generator here — writing one is a project, not a fallback.
 */
import { morphGeneratorFor } from "@molo/core";
import type { MorphPort } from "@molo/db";

import {
  can_generate_plural,
  generate,
  initSync,
  rule_table_json,
} from "../../../crates/xh-morph/pkg/xh_morph.js";
import morphWasm from "../../../crates/xh-morph/pkg/xh_morph_bg.wasm";

let ready = false;
function ensure(): void {
  if (!ready) {
    initSync({ module: morphWasm });
    ready = true;
  }
}

export const FORMS = [
  "plural",
  "singular",
  "subject_concord",
  "object_concord",
  "possessive",
] as const;
export type MorphForm = (typeof FORMS)[number];

export interface MorphPreview {
  readonly lemma: string;
  readonly nounClass: string;
  readonly validated: boolean;
  readonly forms: ReadonlyArray<{
    readonly form: MorphForm;
    readonly surface: string | null;
    readonly error: string | null;
  }>;
}

interface RuleClass {
  label: string;
  validated: boolean;
}

let classesCache: Map<string, RuleClass> | null = null;
function classes(): Map<string, RuleClass> {
  ensure();
  classesCache ??= new Map(
    (JSON.parse(rule_table_json()) as { class: RuleClass[] }).class.map((c) => [c.label, c]),
  );
  return classesCache;
}

/** Every form for a lemma, each either a surface form or the generator's typed error message. */
export function previewForms(lemma: string, nounClass: string): MorphPreview {
  ensure();
  const cls = classes().get(nounClass);
  return {
    lemma,
    nounClass,
    validated: cls?.validated ?? false,
    forms: FORMS.map((form) => {
      try {
        return { form, surface: generate(lemma, nounClass, form), error: null };
      } catch (e) {
        return { form, surface: null, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  };
}

/** The port the editor repository's publish gate uses. False for unvalidated classes by construction. */
export const wasmMorph: MorphPort = {
  generatorFor: morphGeneratorFor,
  canGeneratePlural: (targetLang, lemma, nounClass) => {
    if (morphGeneratorFor(targetLang) === null) return Promise.resolve(false);
    ensure();
    try {
      return Promise.resolve(can_generate_plural(lemma, nounClass));
    } catch {
      return Promise.resolve(false);
    }
  },
};
