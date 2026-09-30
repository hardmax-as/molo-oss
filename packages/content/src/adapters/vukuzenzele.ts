/**
 * Vuk'uzenzele mining (CONTENT.md section 2). The DSFSI Vuk'uzenzele
 * corpus (government magazine, 11 languages, CC BY 4.0, Zenodo
 * 10.5281/zenodo.7598539) is a source of *vocabulary evidence*, never of
 * sentences: government prose is not how people talk. So this adapter
 * writes nothing. It reads isiXhosa text the operator downloaded, counts
 * word forms, measures how much of the corpus the lexicon already covers,
 * and lists the frequent forms the lexicon lacks, for the tutor to decide
 * what is worth adding. Output is a report and an optional CSV.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const SOURCE = "vukuzenzele";
export const LICENCE = "CC-BY-4.0";
export const CITATION =
  "Vuk'uzenzele South African Multilingual Corpus, Data Science for Social Impact (DSFSI), University of Pretoria; CC BY 4.0; doi:10.5281/zenodo.7598539";

/** Word forms: letters only, lowercase, apostrophes dropped; isiXhosa has no case distinctions we care about here. */
export function tokenise(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length > 1);
}

export interface Counts {
  readonly tokens: number;
  readonly forms: Map<string, number>;
}

export function countForms(texts: Iterable<string>): Counts {
  const forms = new Map<string, number>();
  let tokens = 0;
  for (const t of texts) {
    for (const w of tokenise(t)) {
      tokens++;
      forms.set(w, (forms.get(w) ?? 0) + 1);
    }
  }
  return { tokens, forms };
}

/** Reads every *.txt under `dir` (recursively). The operator decides which language files to point at. */
export function* readCorpusDir(dir: string): Generator<string> {
  const entries = readdirSync(dir).sort();
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* readCorpusDir(p);
    else if (name.endsWith(".txt")) yield readFileSync(p, "utf8");
  }
}

export interface MiningReport {
  readonly files: number;
  readonly tokens: number;
  readonly distinctForms: number;
  /** Share of corpus tokens whose form is a lexicon lemma. */
  readonly coverage: number;
  /** Frequent corpus forms not in the lexicon: candidates for the tutor. */
  readonly missing: ReadonlyArray<{ form: string; count: number }>;
  /** Lexicon lemmas seen in the corpus with their counts, most frequent first. */
  readonly seen: ReadonlyArray<{ lemma: string; count: number }>;
}

/**
 * `lemmas` is the lexicon's lemma set (any status). A form counts as covered
 * when it equals a lemma exactly; inflected forms are deliberately not
 * matched, so coverage is a floor, and the missing list may include
 * inflections of known words. The tutor reads it as a shortlist, not truth.
 */
export function mine(
  texts: Iterable<string>,
  lemmas: ReadonlySet<string>,
  opts: { top?: number; minCount?: number } = {},
): Omit<MiningReport, "files"> {
  const top = opts.top ?? 200;
  const minCount = opts.minCount ?? 3;
  const { tokens, forms } = countForms(texts);
  let covered = 0;
  const seen: { lemma: string; count: number }[] = [];
  const missing: { form: string; count: number }[] = [];
  for (const [form, count] of forms) {
    if (lemmas.has(form)) {
      covered += count;
      seen.push({ lemma: form, count });
    } else if (count >= minCount) {
      missing.push({ form, count });
    }
  }
  seen.sort((a, b) => b.count - a.count);
  missing.sort((a, b) => b.count - a.count);
  return {
    tokens,
    distinctForms: forms.size,
    coverage: tokens === 0 ? 0 : covered / tokens,
    missing: missing.slice(0, top),
    seen: seen.slice(0, top),
  };
}

export function toCsv(report: Omit<MiningReport, "files">): string {
  const lines = ["kind,form,count"];
  for (const m of report.missing) lines.push(`missing,${m.form},${m.count}`);
  for (const s of report.seen) lines.push(`seen,${s.lemma},${s.count}`);
  return lines.join("\n") + "\n";
}
