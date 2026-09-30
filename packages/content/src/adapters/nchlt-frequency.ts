/**
 * NCHLT isiXhosa frequency list — Department of Arts and Culture and CTexT,
 * North-West University, via SADiLaR. **CC BY 2.5 South Africa.**
 *
 *   corpora/nchlt-text/xh/3.Lexica/FREQ.LEX.NCHLT.xh.txt
 *   43 028 lines of `<surface form>\t<count>`, ~889 000 tokens in total.
 *
 * This is a **written, governmental** register: gov.za documents. It
 * over-ranks the vocabulary of policy and under-ranks what people say, so
 * it is a first pass to be corrected against speech, never the ranking on
 * its own (corpora/README.md). `frequency.ts` is where that correction is
 * applied and weighted.
 *
 * It is a list of *surface forms*, not lemmas: `ndiyahamba` and `uhambile`
 * are separate lines and neither says it belongs to `hamba`. Matching it to
 * our lexicon is therefore exact-form only, which is deliberate — guessing
 * at morphology here would put invented evidence into the ranking.
 */

export const SOURCE = "nchlt";
export const LICENCE = "CC-BY-2.5-ZA";
export const CITATION =
  "Department of Arts and Culture and CTexT, North-West University, via SADiLaR. NCHLT isiXhosa text corpus.";

export interface FrequencyList {
  /** Lowercased surface form to its corpus count. */
  readonly counts: ReadonlyMap<string, number>;
  /** Total tokens the counts sum to, for normalising into a rate. */
  readonly total: number;
  /** Lines that were not `form<TAB>integer`; reported, never guessed at. */
  readonly unparsed: number;
}

/** Parses the frequency list. Case is folded, because our lemmas are lowercase. */
export function parseFrequencyList(text: string): FrequencyList {
  const counts = new Map<string, number>();
  let total = 0;
  let unparsed = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") continue;
    const tab = line.lastIndexOf("\t");
    if (tab <= 0) {
      unparsed++;
      continue;
    }
    const form = line.slice(0, tab).trim().toLowerCase();
    const n = Number.parseInt(line.slice(tab + 1).trim(), 10);
    if (form === "" || !Number.isFinite(n) || n <= 0) {
      unparsed++;
      continue;
    }
    counts.set(form, (counts.get(form) ?? 0) + n);
    total += n;
  }
  return { counts, total, unparsed };
}
