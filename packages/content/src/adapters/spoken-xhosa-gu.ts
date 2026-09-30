/**
 * Corpus of Spoken isiXhosa — Språkbanken Text, University of Gothenburg.
 *
 *   licence   CC BY 4.0
 *   cite      Språkbanken (2025). Corpus of spoken isiXhosa.
 *             https://doi.org/10.23695/xrsg-mp07
 *   register  spontaneous Eastern Cape conversation, recorded from 2015
 *   audio     none — transcriptions only
 *
 * This is the only conversational, translated, commercially usable isiXhosa
 * sentence material we have (corpora/README.md). It is a *linguistic*
 * transcription, so it is full of false starts, repairs, pauses and
 * inaudible stretches; `teachableSentences` throws almost all of it away on
 * purpose and reports why.
 *
 * Nothing here writes anything. It reads the XML and hands out sentences
 * that a curation step may propose to an editor as `draft`.
 *
 * ## Why the XML is parsed by hand
 *
 * The repository has no XML dependency and adding one for a single fixed
 * corpus file is not worth it (the project rules: propose before adding). The
 * file is machine-written by Sparv 5.3 with a flat, regular shape —
 * `corpus > text > sentence > token` — with no CDATA, no namespaces, no
 * nested elements inside a token, and no attribute values containing `>`.
 * The reader below assumes exactly that and is asserted against a fixture
 * in the sibling test; if a future release of the corpus breaks the shape,
 * the counts in that test move and the parse fails loudly rather than
 * silently dropping material.
 */

export const SOURCE = "spraakbanken.gu.se";
export const LICENCE = "CC-BY-4.0";
export const CITATION =
  "Språkbanken Text, University of Gothenburg (2025). Corpus of spoken isiXhosa. https://doi.org/10.23695/xrsg-mp07";
/** The file `corpora/fetch.sh` unpacks; `source_ref` values are relative to it. */
export const CORPUS_FILE = "xhosa.xml";

export interface CorpusToken {
  /** The corpus's normalised orthographic form. Empty for pure markers. */
  readonly normalized: string;
  /** Morphemes from `segmented`, in order; empty when the corpus gives none. */
  readonly segmented: readonly string[];
  /** Part of speech (`N`, `V`, `CONJ`, `PUNC`, …); null where the corpus left it out. */
  readonly pos: string | null;
  /** The corpus's own English sense for the lexical root. Better evidence than any keyword. */
  readonly sense: string | null;
  /**
   * The transcription marker on the token: `contraction`, `unfinished
   * expression`, `not audible`, `short pause`, `code-switch`, … Null is the
   * normal case.
   */
  readonly marker: string | null;
}

export interface CorpusSentence {
  readonly id: string;
  /** `text/@filename` — the recording the sentence came from. */
  readonly file: string;
  readonly speaker: string | null;
  /** The corpus's free English translation. Absent on 118 of the 4 398 sentences. */
  readonly translation: string | null;
  readonly tokens: readonly CorpusToken[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function unescapeXml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_m, ref: string) => {
    if (ref.startsWith("#x")) return String.fromCodePoint(Number.parseInt(ref.slice(2), 16));
    if (ref.startsWith("#")) return String.fromCodePoint(Number.parseInt(ref.slice(1), 10));
    return ENTITIES[ref] ?? _m;
  });
}

const ATTR = /([\w:-]+)\s*=\s*"([^"]*)"/g;

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR.exec(tag)) !== null) {
    if (m[1] !== undefined && m[2] !== undefined) out[m[1]] = unescapeXml(m[2]);
  }
  return out;
}

const attr = (a: Record<string, string>, k: string): string | null => {
  const v = a[k];
  return v !== undefined && v.trim() !== "" ? v.trim() : null;
};

const TEXT_OPEN = /<text\b([^>]*)>/g;
const SENTENCE = /<sentence\b([^>]*)>([\s\S]*?)<\/sentence>/g;
const TOKEN = /<token\b([^>]*)>([\s\S]*?)<\/token>/g;

/** Parses the whole corpus. ~4 400 sentences and ~21 000 tokens; a few hundred ms. */
export function parseCorpus(xml: string): CorpusSentence[] {
  const out: CorpusSentence[] = [];
  // Where each <text> begins, so a sentence can be attributed to its recording.
  const texts: { at: number; filename: string }[] = [];
  TEXT_OPEN.lastIndex = 0;
  let t: RegExpExecArray | null;
  while ((t = TEXT_OPEN.exec(xml)) !== null) {
    texts.push({ at: t.index, filename: attributes(t[1] ?? "")["filename"] ?? "?" });
  }
  const fileAt = (index: number): string => {
    let file = "?";
    for (const x of texts) {
      if (x.at > index) break;
      file = x.filename;
    }
    return file;
  };

  SENTENCE.lastIndex = 0;
  let s: RegExpExecArray | null;
  while ((s = SENTENCE.exec(xml)) !== null) {
    const a = attributes(s[1] ?? "");
    const body = s[2] ?? "";
    const tokens: CorpusToken[] = [];
    TOKEN.lastIndex = 0;
    let tk: RegExpExecArray | null;
    while ((tk = TOKEN.exec(body)) !== null) {
      const ta = attributes(tk[1] ?? "");
      const segmented = (attr(ta, "segmented") ?? "")
        .split("-")
        .map((p) => p.trim())
        .filter((p) => p !== "" && p !== "_");
      tokens.push({
        normalized: attr(ta, "normalized") ?? "",
        segmented,
        pos: attr(ta, "pos"),
        sense: attr(ta, "sense")?.toLowerCase() ?? null,
        marker: attr(ta, "type"),
      });
    }
    out.push({
      id: attr(a, "id") ?? `#${out.length}`,
      file: fileAt(s.index),
      speaker: attr(a, "speaker"),
      translation: attr(a, "translation"),
      tokens,
    });
  }
  return out;
}

/** `source_ref` for a row derived from this corpus: enough to find the sentence again. */
export function sourceRefFor(s: CorpusSentence): string {
  return `${CORPUS_FILE}:text=${s.file};sentence=${s.id}`;
}

const PUNCTUATION = new Set(["PUNC"]);

/** Word tokens: everything that carries an orthographic form and is not punctuation. */
export function words(s: CorpusSentence): readonly CorpusToken[] {
  return s.tokens.filter((t) => t.normalized !== "" && !PUNCTUATION.has(t.pos ?? ""));
}

/**
 * The isiXhosa text of a sentence, as the corpus normalises it.
 *
 * The element text carries the transcriber's contraction braces
 * (`N{di}qale`), so it cannot be shown to a learner; `normalized` is the
 * corpus's own full orthographic form of the same token. Joining those in
 * order reconstructs the sentence without inventing a character. Sentence
 * capitalisation is the corpus's, not ours.
 */
export function sentenceText(s: CorpusSentence): string {
  let out = "";
  for (const t of s.tokens) {
    if (t.normalized === "") continue;
    if (out === "" || PUNCTUATION.has(t.pos ?? "")) out += t.normalized;
    else out += ` ${t.normalized}`;
  }
  return out.trim();
}

/**
 * Transcription markers that mean the token is not clean speech. Every one
 * of these makes the whole sentence unusable for teaching: a learner must
 * never be shown a repair, an overlap or a guess at an inaudible word.
 * `contraction` is deliberately absent — it marks a normal spoken
 * reduction, and `normalized` already holds the full form.
 */
export const DISQUALIFYING_MARKERS: ReadonlySet<string> = new Set([
  "unfinished expression",
  "not audible",
  "unclear",
  "overlap",
  "comment",
  "short pause",
  "medium pause",
  "long pause",
  "lengthening",
  "code-switch",
]);

export const REJECT_REASONS = [
  "no_translation",
  "disfluency_or_marker",
  "marker_in_token",
  "length",
  "no_predicate",
  "not_sentence_initial",
  "translation_not_a_sentence",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export interface TeachableOptions {
  readonly minWords?: number;
  readonly maxWords?: number;
}

export interface TeachableResult {
  readonly accepted: readonly CorpusSentence[];
  /** Every reason, always present, so a report can show the zeros too. */
  readonly rejected: Readonly<Record<RejectReason, number>>;
  readonly considered: number;
}

/** A clause needs a predicate; without one we are looking at a fragment. */
const PREDICATE_POS = new Set(["V", "VAUX", "COP"]);
/**
 * isiXhosa forms plenty of complete clauses with no verb at all ("abantu
 * baninzi" — the people are many). Rejecting those would throw away exactly
 * the sentences a beginner course wants, so a verbless sentence still counts
 * as a clause when it has a predicate-shaped complement *and* the corpus's
 * own English translation has a copula in it. The translation is the corpus's
 * evidence, not our inference.
 */
const COPULAR_COMPLEMENT_POS = new Set(["ADJ", "REL", "NUM"]);
const ENGLISH_COPULA = /\b(?:is|are|was|were|am|'s|'re)\b/i;
const MARKER_CHARS = /[+{}[\]*]/;

/**
 * The teachable subset. Every rule below throws away real isiXhosa on
 * purpose, because this corpus was recorded to study speech, not to teach
 * it. The counts come back so the operator can see what the filter cost.
 */
export function teachableSentences(
  sentences: readonly CorpusSentence[],
  opts: TeachableOptions = {},
): TeachableResult {
  const minWords = opts.minWords ?? 3;
  const maxWords = opts.maxWords ?? 12;
  const rejected: Record<RejectReason, number> = {
    no_translation: 0,
    disfluency_or_marker: 0,
    marker_in_token: 0,
    length: 0,
    no_predicate: 0,
    not_sentence_initial: 0,
    translation_not_a_sentence: 0,
  };
  const accepted: CorpusSentence[] = [];

  for (const s of sentences) {
    const translation = s.translation?.trim() ?? "";
    if (translation === "") {
      rejected.no_translation++;
      continue;
    }
    if (s.tokens.some((t) => t.marker !== null && DISQUALIFYING_MARKERS.has(t.marker))) {
      rejected.disfluency_or_marker++;
      continue;
    }
    if (s.tokens.some((t) => MARKER_CHARS.test(t.normalized))) {
      rejected.marker_in_token++;
      continue;
    }
    const w = words(s);
    if (w.length < minWords || w.length > maxWords) {
      rejected.length++;
      continue;
    }
    const hasVerb = s.tokens.some((t) => PREDICATE_POS.has(t.pos ?? ""));
    const hasCopularClause =
      s.tokens.some((t) => COPULAR_COMPLEMENT_POS.has(t.pos ?? "")) &&
      ENGLISH_COPULA.test(translation);
    if (!hasVerb && !hasCopularClause) {
      rejected.no_predicate++;
      continue;
    }
    // The corpus capitalises the first word of a sentence and leaves a
    // continuation of the previous one lowercase; that is the cheapest
    // reliable signal that we are looking at half a clause.
    const first = w[0]?.normalized ?? "";
    if (first === "" || first[0] !== first[0]?.toUpperCase()) {
      rejected.not_sentence_initial++;
      continue;
    }
    if (!isFullSentence(translation)) {
      rejected.translation_not_a_sentence++;
      continue;
    }
    accepted.push(s);
  }
  return { accepted, rejected, considered: sentences.length };
}

const TRANSLATION_MARKER = /[+[\]{}]|\.\.\.|\binaudible\b|\bunclear\b/i;

/** The English side must read as one finished sentence, not a fragment of one. */
function isFullSentence(t: string): boolean {
  if (t.split(/\s+/).length < 3) return false;
  const first = t[0] ?? "";
  if (first !== first.toUpperCase() || first === first.toLowerCase()) return false;
  const last = t[t.length - 1] ?? "";
  if (last !== "." && last !== "?" && last !== "!") return false;
  return !TRANSLATION_MARKER.test(t);
}
