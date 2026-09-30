/**
 * Surface-form verification for sentence tokens (ARCHITECTURE section 7).
 *
 * A token is `verified` only when its surface form is a form the lexicon or
 * xh-morph vouches for: the lemma itself (dictionary form, no generation
 * involved) or the class plural of a tutor-validated class. Everything else
 * is `unverified` (xh-morph has nothing to say) or `mismatch` (it generated
 * a form and the editor's differs). Nothing here ever rewrites a form.
 */

import type { TokenVerification, TokenVerificationState } from "@molo/core";

export interface TokenFacts {
  readonly position: number;
  readonly lexemeId: string;
  readonly surfaceForm: string;
  readonly lemma: string;
  readonly pos: string;
  readonly nounClass: string | null;
  /** The plural xh-morph generated for this lemma and class, or null when it could not. */
  readonly generatedPlural: string | null;
  /** Whether the class's rules are tutor-validated (rule table flag). */
  readonly classValidated: boolean;
}

function norm(s: string): string {
  return s.normalize("NFC").trim().toLowerCase();
}

export function checkToken(f: TokenFacts): TokenVerification {
  const surface = norm(f.surfaceForm);
  const base = {
    position: f.position,
    lexemeId: f.lexemeId,
    surfaceForm: f.surfaceForm,
    expectedPlural: f.generatedPlural,
  };
  if (surface === norm(f.lemma)) {
    return { ...base, state: "verified", matched: "lemma", reason: null };
  }
  const isClassedNoun = f.pos === "noun" && f.nounClass !== null;
  if (isClassedNoun && f.generatedPlural !== null) {
    if (surface === norm(f.generatedPlural)) {
      if (f.classValidated) return { ...base, state: "verified", matched: "plural", reason: null };
      return {
        ...base,
        state: "unverified",
        matched: "plural",
        reason: `matches the generated plural, but class ${f.nounClass} is not tutor-validated yet`,
      };
    }
    return {
      ...base,
      state: "mismatch",
      matched: null,
      reason: `neither the lemma "${f.lemma}" nor the generated plural "${f.generatedPlural}"`,
    };
  }
  const state: TokenVerificationState = "unverified";
  return {
    ...base,
    state,
    matched: null,
    reason: isClassedNoun
      ? `xh-morph could not generate a plural for class ${f.nounClass}`
      : "xh-morph has no rule for this part of speech; mark irregular with a note if the form is right",
  };
}

/** Whether a verification result satisfies the gate on its own (irregular + note is the other path). */
export function isVerified(v: TokenVerification): boolean {
  return v.state === "verified";
}
