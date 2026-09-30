/**
 * `curriculum/sentence-requests.json`: the sentences a beginner needs,
 * English-first, waiting for a speaker.
 *
 * ## What is and is not in the file
 *
 * English and Norwegian, drafted by a model around the words each skill
 * already teaches. **No isiXhosa.** A request names the words it should be
 * built around by their lexicon lemma, and this module resolves each one
 * against the lexicon verbatim; a lemma that is not there is reported and
 * left out, never approximated. The sentence itself is typed by a tutor in
 * the dashboard and by nobody else.
 *
 * Pure: the CLI reads the file and the database, and hands both in.
 */

/** One word, as `lemma` or `lemma:pos` when the lexicon has the lemma under two parts of speech. */
export type WordRef = string;

export interface SentenceRequestSpec {
  readonly unitSlug: string;
  readonly skillSlug: string;
  /** Unique within its skill; the natural key a re-run matches on. */
  readonly slug: string;
  readonly order: number;
  readonly en: string;
  readonly nb: string;
  /** Who says it to whom, and anything else the tutor should know. */
  readonly note?: string;
  readonly words: readonly WordRef[];
}

export interface SentenceRequestsFile {
  readonly header: readonly string[];
  readonly version: number;
  readonly requests: readonly SentenceRequestSpec[];
}

export function parseSentenceRequests(json: string): SentenceRequestsFile {
  const raw = JSON.parse(json) as SentenceRequestsFile;
  if (!Array.isArray(raw.requests))
    throw new Error("sentence-requests.json: `requests` must be an array");
  const seen = new Set<string>();
  for (const r of raw.requests) {
    const where = `${r.unitSlug}/${r.skillSlug}/${r.slug}`;
    if (!r.unitSlug || !r.skillSlug || !r.slug)
      throw new Error("sentence-requests.json: a request is missing unitSlug, skillSlug or slug");
    if (seen.has(where)) throw new Error(`sentence-requests.json: ${where} appears twice`);
    seen.add(where);
    if (typeof r.en !== "string" || r.en.trim() === "")
      throw new Error(`sentence-requests.json: ${where} has no English`);
    if (typeof r.nb !== "string" || r.nb.trim() === "")
      throw new Error(`sentence-requests.json: ${where} has no Norwegian`);
    if (!Array.isArray(r.words)) throw new Error(`sentence-requests.json: ${where} has no words`);
    if (!Number.isInteger(r.order) || r.order < 1)
      throw new Error(`sentence-requests.json: ${where} needs a positive integer order`);
  }
  return raw;
}

/** A lexicon row as the resolver needs it. */
export interface RequestLexeme {
  readonly id: string;
  readonly lemma: string;
  readonly pos: string;
}

export const WORD_REJECT_REASONS = ["not_in_lexicon", "ambiguous"] as const;
export type WordRejectReason = (typeof WORD_REJECT_REASONS)[number];

export interface ResolvedWords {
  readonly lexemeIds: readonly string[];
  /** Resolved, but not among the words the skill teaches: worth a look, not an error. */
  readonly outsideSkill: readonly string[];
  readonly rejected: ReadonlyArray<{ readonly word: WordRef; readonly reason: WordRejectReason }>;
}

/**
 * Resolves each word verbatim. When a lemma has more than one lexeme, the
 * one the skill already teaches wins; if that still leaves more than one,
 * the word is ambiguous and dropped (write `lemma:pos` to say which).
 */
export function resolveRequestWords(
  words: readonly WordRef[],
  lexicon: readonly RequestLexeme[],
  skillWordIds: ReadonlySet<string>,
): ResolvedWords {
  const lexemeIds: string[] = [];
  const outsideSkill: string[] = [];
  const rejected: Array<{ word: WordRef; reason: WordRejectReason }> = [];
  for (const word of words) {
    const [lemma, pos] = word.split(":") as [string, string | undefined];
    const all = lexicon.filter((l) => l.lemma === lemma && (pos === undefined || l.pos === pos));
    if (all.length === 0) {
      rejected.push({ word, reason: "not_in_lexicon" });
      continue;
    }
    const taught = all.filter((l) => skillWordIds.has(l.id));
    const pick = taught.length === 1 ? taught[0] : all.length === 1 ? all[0] : undefined;
    if (!pick) {
      rejected.push({ word, reason: "ambiguous" });
      continue;
    }
    if (lexemeIds.includes(pick.id)) continue;
    lexemeIds.push(pick.id);
    if (!skillWordIds.has(pick.id)) outsideSkill.push(word);
  }
  return { lexemeIds, outsideSkill, rejected };
}
