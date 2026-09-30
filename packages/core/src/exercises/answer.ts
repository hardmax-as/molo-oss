/**
 * Typed-answer matching for translate_type and concord_fill (CONTENT.md:
 * "lenient on tone marks, strict on clicks"). Shared by web and mobile so a
 * learner gets the same verdict on both.
 *
 * - Tone and length diacritics (á, à, â, ā ...) are stripped before comparing:
 *   text corpora do not carry tone, so we never punish its absence.
 * - Case, punctuation and extra spaces are ignored.
 * - One typo (Levenshtein 1) is forgiven in words of six letters or more,
 *   except when the typo touches a click consonant (c, x, q and the
 *   digraphs built on them): getting the click wrong is the thing the
 *   course exists to teach, so it is never waved through.
 */

/** Click consonant letters; digraphs (gc, nc, ngc, xh, qh, nq, ...) all contain one of these. */
export const CLICK_LETTERS = new Set(["c", "x", "q"]);

export function normaliseXhosa(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, () => 0);
  const cur = Array.from({ length: b.length + 1 }, () => 0);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

/** The multiset of click letters in a string; two strings with different click letters differ in a click. */
function clickSignature(s: string): string {
  return [...s].filter((ch) => CLICK_LETTERS.has(ch)).join("");
}

export type AnswerVerdict =
  | { readonly ok: true; readonly typo: boolean }
  | { readonly ok: false; readonly reason: "click" | "wrong" };

/**
 * Compares a typed answer with the expected isiXhosa. `typo: true` means it
 * was accepted with one forgiven letter; `reason: "click"` means the only
 * thing wrong was a click consonant, which the UI should call out.
 */
export function answerMatches(given: string, expected: string): AnswerVerdict {
  const g = normaliseXhosa(given);
  const e = normaliseXhosa(expected);
  if (g.length === 0) return { ok: false, reason: "wrong" };
  if (g === e) return { ok: true, typo: false };
  const clickDiffers = clickSignature(g) !== clickSignature(e);
  const gw = g.split(" ");
  const ew = e.split(" ");
  if (gw.length === ew.length) {
    let typos = 0;
    let fine = true;
    for (let i = 0; i < ew.length; i++) {
      const a = gw[i] ?? "";
      const b = ew[i] ?? "";
      if (a === b) continue;
      if (b.length >= 6 && levenshtein(a, b) === 1 && clickSignature(a) === clickSignature(b)) {
        typos++;
        continue;
      }
      fine = false;
      break;
    }
    if (fine && typos <= 1) return { ok: true, typo: true };
  }
  return { ok: false, reason: clickDiffers ? "click" : "wrong" };
}
