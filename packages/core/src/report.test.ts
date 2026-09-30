import { describe, expect, it } from "vitest";

import { formatContentReport, totalOf, type ContentReport } from "./report.ts";

const report: ContentReport = {
  date: "2026-09-04",
  windowDays: 7,
  lexemes: { published: 40, in_review: 5, draft: 50, ai_draft: 5 },
  sentences: { published: 2, draft: 18 },
  exercises: { published: 3, draft: 38 },
  units: { draft: 1 },
  glossesPublished: { nb: 12, en: 40 },
  audio: { tier1: 30, tier2: 4, tier3: 100, pending: 9, inReview: 6 },
  blockers: {
    reviewQueue: 7,
    publishedLexemesWithoutTier12Audio: 6,
    inReviewLexemesWithoutTier12Audio: 2,
    lexemesInUnvalidatedClass: 12,
    unvalidatedNounClasses: 5,
    gate: [
      { kind: "lexeme", code: "audio_missing", detail: null, rows: 34 },
      { kind: "lexeme", code: "gloss_missing", detail: "nb", rows: 12 },
      { kind: "sentence", code: "surface_form_unverified", detail: null, rows: 4 },
    ],
    gateConsidered: { lexemes: 60, sentences: 18 },
  },
  writing: {
    skillsWithoutSentences: [
      {
        skillId: "11111111-1111-4111-8111-111111111111",
        skillSlug: "greet-someone",
        skillTitleKey: "curriculum.units.greet-and-introduce.skills.greet-someone.title",
        unitSlug: "greet-and-introduce",
        unitTitleKey: "curriculum.units.greet-and-introduce.title",
        lessons: 2,
      },
    ],
    skillsWithoutSentencesTotal: 1,
    lexemesMissingNbGloss: 12,
    lexemesMissingEnGloss: 0,
    lexemesMissingBothGlosses: 3,
    exercisesReferencingUnpublished: 8,
    sentencesMissingTranslation: 5,
  },
  recording: {
    byUnit: [{ unitSlug: "unit-1", unitTitleKey: "units.unit1.title", missing: 21 }],
    notInAnyUnit: 40,
    takesAwaitingApproval: 9,
    speakersWithConsent: 1,
    speakersTotal: 2,
  },
  learners: { active: 11, lessonsCompleted: 34, signups: 3, plus: 2 },
};

describe("formatContentReport", () => {
  it("summarises the numbers an editor acts on, tier 3 excluded from audio", () => {
    const text = formatContentReport(report);
    expect(text).toContain("40 published of 100 (40%), 5 in review, 55 drafts");
    expect(text).toContain("en 40, nb 12");
    expect(text).toContain("2 published of 20; exercises: 3 published of 41; units published: 0");
    expect(text).toContain("34 tier-1/2 assets published");
    expect(text).not.toContain("134");
    expect(text).toContain("6 published and 2 in-review lexemes without tier-1/2 audio");
    expect(text).toContain("12 lexemes in an unvalidated noun class (5 classes unvalidated)");
    expect(text).toContain("Review queue: 7");
    expect(text).toContain("11 active, 34 lessons completed, 3 new sign-ups; 2 on Plus");
  });

  it("says nothing about who the learners are", () => {
    const text = formatContentReport(report);
    expect(text).not.toMatch(/@|user_|http/);
  });

  it("survives an empty database without dividing by zero", () => {
    const empty: ContentReport = {
      ...report,
      lexemes: {},
      sentences: {},
      exercises: {},
      units: {},
      glossesPublished: {},
    };
    const text = formatContentReport(empty);
    expect(text).toContain("0 published of 0 (0%)");
    expect(text).toContain("Published glosses: none");
    expect(totalOf(empty.lexemes)).toBe(0);
  });
});
