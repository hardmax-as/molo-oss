/**
 * Linking the words of a tutor's sentence to the lexicon, for the sentence
 * builder (`molo content link-sentences`).
 *
 * A tutor types a sentence; an editor then says which lexeme each word is
 * and in what form. This does the part of that nobody needs to judge: a word
 * whose written form *is* a lexeme's lemma (or its infinitive), by the same
 * exact-form rule the frequency pass uses (`lexicon-match.ts`, rule A). No
 * morphology is guessed at and no isiXhosa is produced: every surface form is
 * the tutor's own word, copied.
 *
 * Everything else is left for a person. A word two lexemes share is linked
 * only if exactly one of them is a word the request asked for; otherwise it
 * is reported as ambiguous. A word that matches nothing gets hints: the
 * request's words whose lemma appears inside it, which is a reading aid for
 * the editor, never a link.
 */

import { fold, matchForm, type LexiconIndex } from "./lexicon-match.ts";

export interface PlannedToken {
  readonly position: number;
  readonly lexemeId: string;
  /** The word exactly as the tutor wrote it, punctuation trimmed. */
  readonly surfaceForm: string;
  /**
   * The word is the lemma itself, the one case xh-morph vouches for without
   * generating anything (apps/api/src/verify.ts). An infinitive match is
   * linked but not verified: an editor marks it irregular with a note or it
   * waits for a rule.
   */
  readonly isLemma: boolean;
}

export interface SentenceLinkPlan {
  readonly tokens: readonly PlannedToken[];
  readonly ambiguous: ReadonlyArray<{
    readonly word: string;
    readonly lexemeIds: readonly string[];
  }>;
  readonly unlinked: ReadonlyArray<{ readonly word: string; readonly hints: readonly string[] }>;
  /** Words the request asked for that no linked token uses. */
  readonly targetsUnused: readonly string[];
}

const EDGE_PUNCTUATION = /^[\s.,!?;:"“”‘’'()[\]…—–-]+|[\s.,!?;:"“”‘’'()[\]…—–-]+$/gu;

/** The words of a sentence as written, punctuation trimmed from each end. */
export function sentenceWords(text: string): string[] {
  return text
    .normalize("NFC")
    .split(/\s+/u)
    .map((w) => w.replace(EDGE_PUNCTUATION, ""))
    .filter((w) => w !== "");
}

function sameForm(a: string, b: string): boolean {
  return a.normalize("NFC").trim().toLowerCase() === b.normalize("NFC").trim().toLowerCase();
}

export function planSentenceLinks(
  text: string,
  index: LexiconIndex,
  targetIds: readonly string[],
): SentenceLinkPlan {
  const targets = new Set(targetIds);
  const tokens: PlannedToken[] = [];
  const ambiguous: Array<{ word: string; lexemeIds: readonly string[] }> = [];
  const unlinked: Array<{ word: string; hints: string[] }> = [];

  for (const word of sentenceWords(text)) {
    const ids = matchForm(index, word);
    const chosen = ids.length === 1 ? ids : ids.filter((id) => targets.has(id));
    if (chosen.length === 1) {
      const lexeme = index.byId.get(chosen[0]!)!;
      tokens.push({
        position: tokens.length,
        lexemeId: lexeme.id,
        surfaceForm: word,
        isLemma: sameForm(word, lexeme.lemma),
      });
    } else if (ids.length > 1) {
      ambiguous.push({ word, lexemeIds: ids });
    } else {
      const folded = fold(word);
      const hints = [...targets]
        .map((id) => index.byId.get(id))
        .filter(
          (l) => l !== undefined && fold(l.lemma).length >= 3 && folded.includes(fold(l.lemma)),
        )
        .map((l) => l!.lemma);
      unlinked.push({ word, hints });
    }
  }

  const used = new Set(tokens.map((t) => t.lexemeId));
  const targetsUnused = [...targets]
    .filter((id) => !used.has(id))
    .map((id) => index.byId.get(id)?.lemma ?? id);
  return { tokens, ambiguous, unlinked, targetsUnused };
}
