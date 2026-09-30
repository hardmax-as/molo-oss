/**
 * Blending two corpora into one `lexemes.frequency_rank`.
 *
 * We have exactly two sources of frequency evidence and they disagree about
 * what isiXhosa is:
 *
 *   - **Gothenburg**, ~18 500 running words of spontaneous Eastern Cape
 *     conversation. Tiny, and the right register.
 *   - **NCHLT**, ~889 000 running words of government prose. Large, and the
 *     wrong register.
 *
 * Register is the entire point of this course (docs/CONTENT.md section 4: a
 * sentence that reads like a cabinet statement is a bug), so the ranking has
 * to say that a word people actually say beats a word that is merely
 * frequent in a gazette.
 *
 * ## The rule
 *
 *   rate      = occurrences / corpus tokens x 1 000 000
 *   score     = 9 x ln(1 + spokenRate) + 1 x ln(1 + writtenRate)
 *   rank      = position in descending score; ties broken by lemma, then id
 *
 * `ln(1 + rate)` rather than the rate itself, because the spoken corpus is
 * small enough that one extra occurrence of a common word would otherwise
 * swamp everything below it. The logarithm compares orders of magnitude,
 * which is the only thing a corpus this size can honestly support.
 *
 * ## What the 9:1 weight actually does, stated plainly
 *
 * The two corpora differ in size by a factor of about fifty, so a single
 * occurrence in the spoken corpus is already ~54 per million while a single
 * occurrence in the written corpus is ~1.1 per million. Combined with the
 * 9:1 weight this has a consequence worth naming rather than discovering:
 *
 *   **every word attested even once in conversation outranks every word
 *   attested only in government prose.**
 *
 * The most frequent written-only word available (`ukuba`, ~19 000
 * occurrences, ~21 800 per million) scores about 10.0; the rarest
 * spoken-attested word scores about 9 x ln(1 + 54) = 36. That is
 * intentional, and it is what "weight the conversational counts far above
 * the written counts" has to mean when one corpus is fifty times the other.
 * Within each group the corpus rate still orders the words, and the written
 * term still breaks ties between two words heard the same number of times.
 *
 * If an editor decides this is too blunt — a defensible position once the
 * spoken corpus grows — the two constants below are the whole knob, and
 * `frequency.test.ts` pins the behaviour that changing them would change.
 *
 * Words in neither corpus get **no rank at all** (`null`), which sorts last
 * everywhere and keeps them out of Units 1 to 3 by construction
 * (docs/ARCHITECTURE.md section 2.3).
 */

/** Weight on the conversational corpus. See the header for what 9:1 implies. */
export const SPOKEN_WEIGHT = 9;
/** Weight on the written governmental corpus. */
export const WRITTEN_WEIGHT = 1;

export interface FrequencyEvidence {
  readonly id: string;
  /** Sorted on for a deterministic tie-break; never used as evidence. */
  readonly lemma: string;
  /** Occurrences in the Gothenburg spoken corpus. */
  readonly spoken: number;
  /** Occurrences in the NCHLT written frequency list. */
  readonly written: number;
}

export interface CorpusSizes {
  readonly spokenTokens: number;
  readonly writtenTokens: number;
}

export interface RankedLexeme {
  readonly id: string;
  readonly lemma: string;
  readonly rank: number;
  readonly score: number;
  readonly spoken: number;
  readonly written: number;
}

const perMillion = (n: number, total: number): number => (total > 0 ? (n / total) * 1_000_000 : 0);

/** The blended score for one word. Exported so a report can show its parts. */
export function frequencyScore(e: FrequencyEvidence, sizes: CorpusSizes): number {
  return (
    SPOKEN_WEIGHT * Math.log1p(perMillion(e.spoken, sizes.spokenTokens)) +
    WRITTEN_WEIGHT * Math.log1p(perMillion(e.written, sizes.writtenTokens))
  );
}

/**
 * Ranks every lexeme with evidence in at least one corpus, best first.
 * Lexemes with no evidence are simply absent from the result: the caller
 * writes `null` for them, it does not invent a rank at the end of the list.
 */
export function rankLexemes(
  evidence: readonly FrequencyEvidence[],
  sizes: CorpusSizes,
): readonly RankedLexeme[] {
  const scored = evidence
    .filter((e) => e.spoken > 0 || e.written > 0)
    .map((e) => ({ e, score: frequencyScore(e, sizes) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.e.lemma.localeCompare(b.e.lemma, "en") ||
        a.e.id.localeCompare(b.e.id, "en"),
    );
  return scored.map(({ e, score }, i) => ({
    id: e.id,
    lemma: e.lemma,
    rank: i + 1,
    score,
    spoken: e.spoken,
    written: e.written,
  }));
}
