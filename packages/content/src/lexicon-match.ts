/**
 * Matching corpus evidence to our lexemes.
 *
 * Both corpora say something about a word; neither says which of *our* rows
 * it is. This module is the only place that decides, and it is deliberately
 * conservative, because a wrong match puts a wrong frequency rank and a
 * wrong theme on a row an editor then has to unpick.
 *
 * Two rules, and nothing else:
 *
 *   A. **exact form** — the corpus form equals the lemma (case folded,
 *      parentheses and hyphens removed). No morphology is guessed at, so
 *      there is nothing to be wrong about. This is the only rule the NCHLT
 *      surface-form list gets, since it carries no analysis at all.
 *
 *   B. **root and sense** — the Gothenburg corpus segments every token into
 *      morphemes and glosses the lexical root, so `ngonyaka` arrives as
 *      `nga-u-nyaka` with `sense="year"`. We match when the token's root
 *      equals a root we derive from the lemma **and** the corpus's own
 *      sense is one of the lexeme's English glosses. Requiring both is what
 *      keeps `umthi` "tree" apart from the verb `thi` "say", which a root
 *      match alone merges and which a naive prefix-stripper gets wrong 240
 *      times in this corpus.
 *
 * Roots come off a lemma by removing the *declared* noun-class prefix from
 * `xh-morph`'s own strip table — never by guessing a prefix off the surface
 * form, which is the mistake the rule table's header warns about.
 */

/**
 * Surface prefixes `xh-morph` recognises per class, longest first. Copied
 * from `crates/xh-morph/rules/noun_classes.toml`; classes 11 to 15 are not
 * in that table yet, and the two entries here that are (11, 14, 15) are
 * marked as such so nobody mistakes them for validated rules.
 */
export const CLASS_STRIP: Readonly<Record<string, readonly string[]>> = {
  "1": ["um"],
  "1a": ["u"],
  "2": ["aba"],
  "2a": ["oo"],
  "3": ["um"],
  "4": ["imi"],
  "5": ["ili", "i"],
  "6": ["ama"],
  "7": ["isi", "is"],
  "8": ["izi", "iz"],
  "9": ["i"],
  "10": ["izi", "ii"],
  // Not in xh-morph's rule table. Listed from the standard descriptions so
  // the frequency pass can see these words at all; nothing is generated from
  // them and no learner ever sees their output.
  "11": ["ulu", "u"],
  "14": ["ubu", "ub"],
  "15": ["uku", "uk"],
};

export interface MatchableLexeme {
  readonly id: string;
  readonly lemma: string;
  readonly pos: string;
  readonly nounClassLabel: string | null;
  readonly infinitive: string | null;
  /** English glosses, as written on the row. Split and normalised here. */
  readonly glosses: readonly string[];
}

/** Fold a form the way both sides are folded before comparison. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[()\-’']/g, "")
    .trim();
}

/** Normalise a gloss for sense comparison: lowercase, no article, no "to ". */
export function normaliseGloss(g: string): readonly string[] {
  const whole = g.toLowerCase().trim();
  const parts = whole
    .split(/[;,/]| or /)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const out = new Set<string>([whole, ...parts]);
  for (const p of [whole, ...parts]) {
    const bare = p.replace(/^(?:to|a|an|the)\s+/, "");
    if (bare !== "") out.add(bare);
  }
  return [...out];
}

/** Every root a lemma may appear as in the corpus's `segmented` analysis. */
export function rootsOf(l: Pick<MatchableLexeme, "lemma" | "pos" | "nounClassLabel">): string[] {
  const base = fold(l.lemma);
  const out = new Set<string>([base]);
  if (l.pos === "noun") {
    for (const prefix of CLASS_STRIP[l.nounClassLabel ?? ""] ?? []) {
      if (base.startsWith(prefix) && base.length - prefix.length >= 2) {
        out.add(base.slice(prefix.length));
        break; // longest first, so the first hit is the right one
      }
    }
  }
  // A verb lemma is cited with its final vowel (`hamba`); the corpus segments
  // the root without it (`hamb-a`, `hamb-e`, `hamb-ile`).
  if (l.pos === "verb" && base.endsWith("a") && base.length > 2) out.add(base.slice(0, -1));
  return [...out];
}

export interface LexiconIndex {
  readonly byForm: ReadonlyMap<string, readonly string[]>;
  readonly byRoot: ReadonlyMap<string, readonly string[]>;
  readonly glossesById: ReadonlyMap<string, ReadonlySet<string>>;
  readonly byId: ReadonlyMap<string, MatchableLexeme>;
}

function push(m: Map<string, string[]>, key: string, id: string): void {
  if (key === "") return;
  const list = m.get(key);
  if (list) {
    if (!list.includes(id)) list.push(id);
  } else m.set(key, [id]);
}

export function buildLexiconIndex(lexemes: readonly MatchableLexeme[]): LexiconIndex {
  const byForm = new Map<string, string[]>();
  const byRoot = new Map<string, string[]>();
  const glossesById = new Map<string, ReadonlySet<string>>();
  const byId = new Map<string, MatchableLexeme>();
  for (const l of lexemes) {
    byId.set(l.id, l);
    push(byForm, fold(l.lemma), l.id);
    if (l.infinitive) push(byForm, fold(l.infinitive), l.id);
    for (const r of rootsOf(l)) push(byRoot, r, l.id);
    glossesById.set(l.id, new Set(l.glosses.flatMap((g) => normaliseGloss(g))));
  }
  return { byForm, byRoot, glossesById, byId };
}

/** Rule A on its own: the only rule a bare surface-form list may have. */
export function matchForm(index: LexiconIndex, form: string): readonly string[] {
  return index.byForm.get(fold(form)) ?? [];
}

export interface AnnotatedToken {
  readonly normalized: string;
  readonly segmented: readonly string[];
  readonly sense: string | null;
}

/** Roots the corpus's own segmentation offers for a token. */
function tokenRoots(t: AnnotatedToken): string[] {
  const parts = t.segmented.map((p) => p.toLowerCase());
  if (parts.length === 0) return [];
  const last = parts[parts.length - 1] ?? "";
  const out = [last];
  // Class 9/10 keep the nasal with the stem in xh-morph's model, and the
  // corpus sometimes splits it off (`i-n-dlu`); try the last two together.
  if (parts.length >= 2) out.push(`${parts[parts.length - 2] ?? ""}${last}`);
  return out.filter((r) => r !== "");
}

/**
 * Rules A and B together. Returns lexeme ids, most confident first (exact
 * form before root-and-sense). A token may legitimately match more than one
 * row: `hayi` is both an adverb and an interjection in our lexicon.
 */
export function matchToken(index: LexiconIndex, t: AnnotatedToken): readonly string[] {
  const out: string[] = [];
  for (const id of index.byForm.get(fold(t.normalized)) ?? []) out.push(id);
  const sense = t.sense?.toLowerCase().trim();
  if (sense) {
    for (const root of tokenRoots(t)) {
      for (const id of index.byRoot.get(root) ?? []) {
        if (out.includes(id)) continue;
        if (index.glossesById.get(id)?.has(sense)) out.push(id);
      }
    }
  }
  return out;
}
