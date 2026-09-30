/**
 * Deciding which skill a word belongs to.
 *
 * This is the part of curation that most wants to be a model call and most
 * must not be. An editor has to be able to read why `inkomo` landed in
 * "Name animals and plants" and change it, so every decision here traces to
 * one line of `curriculum/themes.json` and the rule that fired is reported
 * alongside the word.
 *
 * The rules, in the order they are applied:
 *
 *   1. `exclude` vetoes. A gloss containing an excluded phrase disqualifies
 *      the word from that theme, whatever else matches. This is how the
 *      lexicon's statistical and legal tail stays out of a beginner course.
 *      `maxLemmaWords` vetoes the same way on a lemma that is a phrase.
 *   2. `pos`, when the theme sets it, restricts which words may match.
 *   3. `senses` (evidence 3) matches the Gothenburg corpus's own `sense`
 *      attribute for that lexeme. The corpus is telling us what the word
 *      meant in a real conversation, which beats a dictionary gloss.
 *   4. `keywords` (evidence 2) matches whole words or whole phrases inside
 *      an English gloss.
 *   5. `lemmaPatterns` (evidence 1) matches the isiXhosa lemma itself. It is
 *      the weakest evidence on purpose: spelling says nothing about meaning,
 *      so a theme that matches on spelling only gets the words no theme
 *      could claim on meaning. That is what keeps the click drill from
 *      stealing every word with an x in it from the skill that needs it.
 *
 * A word goes to its highest-evidence theme; a tie goes to the theme whose
 * skill comes first in the spine, so a word is taught the first time it is
 * useful and never twice.
 */

import type { Theme, ThemeMap } from "./spine.ts";

export type MatchRule = "sense" | "keyword" | "lemma";

export interface ThemeCandidate {
  readonly id: string;
  readonly lemma: string;
  readonly pos: string;
  /** English glosses on the row. */
  readonly glosses: readonly string[];
  /** Senses the Gothenburg corpus attached to tokens of this lexeme. */
  readonly corpusSenses: readonly string[];
}

export interface ThemeMatch {
  readonly theme: string;
  /** 3 for a corpus sense, 2 for a gloss keyword, 1 for a lemma pattern. */
  readonly evidence: number;
  readonly rule: MatchRule;
  /** The exact line of themes.json that fired, so a report can quote it. */
  readonly matched: string;
}

const lower = (s: string): string => s.toLowerCase().trim();

/**
 * Whole-word / whole-phrase containment. `car` must not match `carry` and
 * `ear` must not match `year`, which plain `includes` gets wrong and a
 * regex per keyword would get right slowly; this does it by hand.
 */
export function containsPhrase(haystack: string, needle: string): boolean {
  const h = lower(haystack);
  const n = lower(needle);
  if (n === "") return false;
  let from = 0;
  for (;;) {
    const at = h.indexOf(n, from);
    if (at < 0) return false;
    const before = at === 0 ? " " : h[at - 1];
    const after = at + n.length >= h.length ? " " : h[at + n.length];
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = at + 1;
  }
}

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && /[a-z0-9]/.test(c);
}

/** Words in a lemma, split on spaces and on the slash dictionaries use between variants. */
export function lemmaWordCount(lemma: string): number {
  return lemma.split(/[\s/]+/).filter((w) => w !== "").length;
}

/**
 * Why a theme refuses this word outright, or null. The relevance guard:
 * the same rules decide what curation may choose and what
 * `molo content reconcile-unit-1` takes back out of an existing unit, so a
 * word removed once is never chosen again. Only English glosses and the
 * shape of the lemma are read; no isiXhosa is judged.
 */
export function themeVeto(
  theme: Theme,
  word: { readonly lemma: string; readonly glosses: readonly string[] },
): string | null {
  if (theme.maxLemmaWords !== undefined && lemmaWordCount(word.lemma) > theme.maxLemmaWords)
    return `lemma of more than ${theme.maxLemmaWords} word${theme.maxLemmaWords === 1 ? "" : "s"}`;
  for (const bad of theme.exclude) {
    for (const g of word.glosses)
      if (containsPhrase(g, bad)) return `gloss "${g}" contains "${bad}"`;
  }
  return null;
}

/** Every theme that accepts this word, with the evidence and the line that fired. */
export function matchThemes(
  word: ThemeCandidate,
  themes: ThemeMap,
  /** Theme names in spine order; used only to break ties deterministically. */
  order: readonly string[],
): readonly ThemeMatch[] {
  const out: ThemeMatch[] = [];
  for (const [name, theme] of Object.entries(themes.themes)) {
    if (theme.pos && theme.pos.length > 0 && !theme.pos.includes(word.pos)) continue;
    if (themeVeto(theme, word) !== null) continue;

    let best: ThemeMatch | null = null;
    for (const sense of theme.senses) {
      if (word.corpusSenses.some((s) => lower(s) === lower(sense))) {
        best = { theme: name, evidence: 3, rule: "sense", matched: sense };
        break;
      }
    }
    if (!best) {
      for (const kw of theme.keywords) {
        if (word.glosses.some((g) => containsPhrase(g, kw))) {
          best = { theme: name, evidence: 2, rule: "keyword", matched: kw };
          break;
        }
      }
    }
    if (!best && theme.lemmaPatterns) {
      for (const pattern of theme.lemmaPatterns) {
        if (safeTest(pattern, word.lemma)) {
          best = { theme: name, evidence: 1, rule: "lemma", matched: pattern };
          break;
        }
      }
    }
    if (best) out.push(best);
  }
  const rank = new Map(order.map((t, i) => [t, i]));
  return out.sort(
    (a, b) =>
      b.evidence - a.evidence ||
      (rank.get(a.theme) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.theme) ?? Number.MAX_SAFE_INTEGER),
  );
}

const compiled = new Map<string, RegExp | null>();

/** A bad pattern in the data file is an editor's typo, not a crash. */
function safeTest(pattern: string, value: string): boolean {
  let re = compiled.get(pattern);
  if (re === undefined) {
    try {
      re = new RegExp(pattern, "i");
    } catch {
      re = null;
    }
    compiled.set(pattern, re);
  }
  return re !== null && re.test(value);
}

/** The one theme a word is taught under, or null if nothing matched. */
export function assignTheme(
  word: ThemeCandidate,
  themes: ThemeMap,
  order: readonly string[],
): ThemeMatch | null {
  return matchThemes(word, themes, order)[0] ?? null;
}
