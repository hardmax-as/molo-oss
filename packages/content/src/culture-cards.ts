/**
 * `curriculum/culture-cards.json`: short notes on how isiXhosa is used,
 * drafted by a model, for a tutor to confirm or strike.
 *
 * ## The rule this module enforces
 *
 * The English and Norwegian prose was written by a model and enters as
 * `ai_draft`. The isiXhosa in it was not written by anybody: every isiXhosa
 * word in a card is a placeholder, `{lemma}`, naming a word the card
 * declares in `words`, and it is filled here from the lexicon verbatim. A
 * placeholder the lexicon cannot answer drops the whole card rather than
 * shipping a guess. A lexicon word that turns up in the prose *outside* a
 * placeholder is reported, so a reviewer can see where the rule was bent.
 *
 * Every card carries a `caveat`: the exact claims the tutor must confirm.
 * It is stored in `exercises.note`, which no learner route returns.
 *
 * Pure: the CLI reads the file and the lexicon, and hands both in.
 */

import { SOURCE_LANGUAGES, type SourceLang } from "@molo/core";

import type { RequestLexeme, WordRef } from "./sentence-requests.ts";

export interface CultureCardSpec {
  readonly slug: string;
  readonly unitSlug: string;
  readonly skillSlug: string;
  readonly order: number;
  /** The lemmas the card is about; each may appear in the prose as `{lemma}`. */
  readonly words: readonly WordRef[];
  /** The claims the tutor must confirm, as a numbered list in one string. */
  readonly caveat: string;
  readonly title: Readonly<Record<SourceLang, string>>;
  readonly body: Readonly<Record<SourceLang, string>>;
}

export interface CultureCardsFile {
  readonly header: readonly string[];
  readonly version: number;
  readonly cards: readonly CultureCardSpec[];
}

const PLACEHOLDER = /\{([^{}]+)\}/g;

/** The `{lemma}` placeholders in a string, in order. */
export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
}

export function parseCultureCards(json: string): CultureCardsFile {
  const raw = JSON.parse(json) as CultureCardsFile;
  if (!Array.isArray(raw.cards)) throw new Error("culture-cards.json: `cards` must be an array");
  const seen = new Set<string>();
  for (const c of raw.cards) {
    if (!c.slug || !c.unitSlug || !c.skillSlug)
      throw new Error("culture-cards.json: a card is missing slug, unitSlug or skillSlug");
    if (seen.has(c.slug)) throw new Error(`culture-cards.json: ${c.slug} appears twice`);
    seen.add(c.slug);
    if (!c.caveat?.trim())
      // Not optional. A card with no caveat tells the tutor nothing about
      // which of its claims they are being asked to vouch for.
      throw new Error(`culture-cards.json: ${c.slug} has no caveat`);
    if (!Array.isArray(c.words)) throw new Error(`culture-cards.json: ${c.slug} has no words`);
    for (const lang of SOURCE_LANGUAGES) {
      if (!c.title?.[lang]?.trim())
        throw new Error(`culture-cards.json: ${c.slug} has no ${lang} title`);
      if (!c.body?.[lang]?.trim())
        throw new Error(`culture-cards.json: ${c.slug} has no ${lang} body`);
      for (const text of [c.title[lang], c.body[lang]]) {
        for (const p of placeholdersIn(text)) {
          if (!c.words.includes(p))
            throw new Error(
              `culture-cards.json: ${c.slug} (${lang}) uses {${p}}, which is not in its words`,
            );
        }
        // A brace that is not part of a placeholder is almost certainly a typo
        // that would reach the learner verbatim.
        if (text.replace(PLACEHOLDER, "").match(/[{}]/))
          throw new Error(`culture-cards.json: ${c.slug} (${lang}) has an unmatched brace`);
      }
    }
  }
  return raw;
}

export interface RenderedCard {
  readonly payload: {
    readonly type: "culture_card";
    readonly title: Record<SourceLang, string>;
    readonly body: Record<SourceLang, string>;
    readonly lexemeIds: readonly string[];
  };
  /** Lexicon lemmas found in the prose outside a placeholder, per language. */
  readonly strayWords: ReadonlyArray<{ readonly lang: SourceLang; readonly word: string }>;
}

export type CardResult =
  | { readonly ok: true; readonly card: RenderedCard }
  | { readonly ok: false; readonly missing: readonly WordRef[] };

/**
 * Fills a card's placeholders from the lexicon. `lexicon` is every lexeme
 * of the course's language; a declared word must match a lemma verbatim
 * (`lemma:pos` narrows it), and the card is refused if any does not.
 */
export function renderCultureCard(
  spec: CultureCardSpec,
  lexicon: readonly RequestLexeme[],
): CardResult {
  const resolved = new Map<WordRef, RequestLexeme>();
  const missing: WordRef[] = [];
  for (const word of spec.words) {
    const [lemma, pos] = word.split(":") as [string, string | undefined];
    const hit = lexicon.find((l) => l.lemma === lemma && (pos === undefined || l.pos === pos));
    if (hit) resolved.set(word, hit);
    else missing.push(word);
  }
  if (missing.length > 0) return { ok: false, missing };

  const fill = (text: string) =>
    text.replace(PLACEHOLDER, (_, w: string) => (resolved.get(w) as RequestLexeme).lemma);

  // Lemmas long enough not to be ordinary English or Norwegian by accident.
  // A hit is a warning, not a refusal: "into" is both an isiXhosa noun and an
  // English preposition, and only a reader can tell which the prose meant.
  const lemmas = new Set(
    lexicon.filter((l) => l.lemma.length >= 4).map((l) => l.lemma.toLowerCase()),
  );
  const strayWords: Array<{ lang: SourceLang; word: string }> = [];
  const title = {} as Record<SourceLang, string>;
  const body = {} as Record<SourceLang, string>;
  for (const lang of SOURCE_LANGUAGES) {
    title[lang] = fill(spec.title[lang]);
    body[lang] = fill(spec.body[lang]);
    const prose = `${spec.title[lang]} ${spec.body[lang]}`.replace(PLACEHOLDER, " ");
    for (const token of prose.toLowerCase().match(/[\p{L}]+/gu) ?? []) {
      if (lemmas.has(token) && !strayWords.some((s) => s.lang === lang && s.word === token))
        strayWords.push({ lang, word: token });
    }
  }
  return {
    ok: true,
    card: {
      payload: {
        type: "culture_card",
        title,
        body,
        lexemeIds: [...new Set([...resolved.values()].map((l) => l.id))],
      },
      strayWords,
    },
  };
}
