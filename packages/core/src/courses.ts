/**
 * Courses (ARCHITECTURE section 2.6). A course is a curriculum over a
 * target language, not the language itself: `units` belong to a course,
 * lexemes and sentences belong to a language, and two courses over the same
 * language share one lexicon.
 *
 * isiXhosa is the only course there is, and nothing here creates a second
 * one. This module exists so that the day one is created, the questions
 * "which language is this?" and "which generator does it use?" already have
 * answers in code rather than in an assumption.
 */

/** The slug of the course every existing row was backfilled to. */
export const XHOSA_COURSE_SLUG = "xhosa";

/**
 * Target language → the morphology generator that vouches for its forms.
 * isiXhosa has `xh-morph`; nothing else has one, and a language with no
 * generator has no morphology-dependent publishing (see `publish-gate.ts`).
 * Adding a language here without a generator crate behind it is a bug.
 */
export const MORPH_GENERATORS: Readonly<Record<string, string>> = { xh: "xh-morph" };

/** The generator for a target language, or null when it has none. */
export function morphGeneratorFor(targetLang: string): string | null {
  return MORPH_GENERATORS[targetLang] ?? null;
}
