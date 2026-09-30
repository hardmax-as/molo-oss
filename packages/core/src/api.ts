/**
 * API boundary contracts (ARCHITECTURE section 1: Effect Schema at the
 * boundary). Shared by apps/api (decode requests, encode responses) and the
 * clients (decode responses). Queue messages live here too.
 */

import { Schema } from "effect";

import { AgeGroupSchema, AUDIO_TARGET_KINDS, AudioRef, AudioTierSchema } from "./audio.ts";
import {
  CefrBandSchema,
  LicenceSchema,
  NounClassLabelSchema,
  RegisterSchema,
  SkillKindSchema,
  Slug,
  SourceLangSchema,
  Uuid,
} from "./content.ts";
import { ExerciseTypeSchema } from "./exercises/index.ts";
import { GrammarCellRoleSchema, GrammarNoteView } from "./grammar.ts";
import { EXERCISE_MOMENTS } from "./lesson.ts";
import { LESSON_KINDS } from "./path.ts";
import { RoleSchema, StatusSchema } from "./status.ts";

/** The lesson badge at the boundary; the rule that picks it is in `lesson.ts`. */
export const ExerciseMomentSchema = Schema.Literal(...EXERCISE_MOMENTS);

// ---------------------------------------------------------------------------
// Courses (ARCHITECTURE section 2.6)
// ---------------------------------------------------------------------------

/**
 * One course: a curriculum over a target language. There is exactly one
 * (isiXhosa) and the clients have no picker yet, but every learner read is
 * already scoped to the enrolled course rather than to "the" curriculum.
 */
export const CourseView = Schema.Struct({
  id: Uuid,
  slug: Slug,
  /** A `languages.code`, e.g. `xh`. The lexicon this course teaches from. */
  targetLang: Schema.String,
  titleKey: Schema.String,
  order: Schema.Int,
  isDefault: Schema.Boolean,
});
export type CourseView = typeof CourseView.Type;

/** GET /courses — published courses, plus which one the caller is studying. */
export const CoursesResponse = Schema.Struct({
  courses: Schema.Array(CourseView),
  enrolledCourseId: Schema.NullOr(Uuid),
});
export type CoursesResponse = typeof CoursesResponse.Type;

// ---------------------------------------------------------------------------
// Learner reads
// ---------------------------------------------------------------------------

export const UnitSummary = Schema.Struct({
  id: Uuid,
  slug: Slug,
  titleKey: Schema.String,
  order: Schema.Int,
  cefrBand: CefrBandSchema,
  prerequisiteUnitId: Schema.NullOr(Uuid),
  /** Published lessons in the unit; a guest client uses it to tell when it has finished one. */
  lessonCount: Schema.Int,
  /**
   * Computed server-side for a signed-in learner: the prerequisite is
   * neither completed nor crowned. Always false for a guest, who computes
   * the same rule from the lessons kept on the device.
   */
  locked: Schema.Boolean,
  prerequisiteSlug: Schema.NullOr(Slug),
  prerequisiteTitleKey: Schema.NullOr(Schema.String),
});
export type UnitSummary = typeof UnitSummary.Type;

export const UnitsResponse = Schema.Struct({ units: Schema.Array(UnitSummary) });

/** "any" | "female" | "male" | "child" | a speaker id. */
export const VoicePreference = Schema.String;

export const LexemeView = Schema.Struct({
  id: Uuid,
  lemma: Schema.String,
  pos: Schema.String,
  nounClass: Schema.NullOr(Schema.String),
  isPlural: Schema.Boolean,
  infinitive: Schema.NullOr(Schema.String),
  register: RegisterSchema,
  gloss: Schema.NullOr(
    Schema.Struct({
      gloss: Schema.String,
      usageNote: Schema.NullOr(Schema.String),
      contrastiveNote: Schema.NullOr(Schema.String),
    }),
  ),
  audio: Schema.NullOr(AudioRef),
  /** Every published voice for this word, the chosen one first. */
  voices: Schema.Array(AudioRef),
});
export type LexemeView = typeof LexemeView.Type;

export const SentenceView = Schema.Struct({
  id: Uuid,
  textXh: Schema.String,
  gloss: Schema.NullOr(
    Schema.Struct({ gloss: Schema.String, literalGloss: Schema.NullOr(Schema.String) }),
  ),
  tokens: Schema.Array(
    Schema.Struct({ position: Schema.Int, lexemeId: Uuid, surfaceForm: Schema.String }),
  ),
  audio: Schema.NullOr(AudioRef),
  voices: Schema.Array(AudioRef),
});
export type SentenceView = typeof SentenceView.Type;

export const ExerciseView = Schema.Struct({
  id: Uuid,
  order: Schema.Int,
  type: ExerciseTypeSchema,
  /** Validated against the per-type schema on write; passed through here. */
  payload: Schema.Unknown,
  /**
   * The published lexemes this exercise teaches (`taughtLexemeIds` plus the
   * words of any sentence it uses). A guest derives its own badge from these
   * against the lessons kept on the device.
   */
  teaches: Schema.Array(Uuid),
  /**
   * "new word" or "tricky", computed server-side for a signed-in learner
   * from finished lessons and `learner_mistakes`. Null for a guest, and null
   * when the exercise is neither.
   */
  moment: Schema.NullOr(ExerciseMomentSchema),
});
export type ExerciseView = typeof ExerciseView.Type;

export const LessonView = Schema.Struct({
  id: Uuid,
  order: Schema.Int,
  estimatedMinutes: Schema.Int,
  exercises: Schema.Array(ExerciseView),
});

export const SkillView = Schema.Struct({
  id: Uuid,
  slug: Slug,
  titleKey: Schema.String,
  order: Schema.Int,
  kind: Schema.String,
  lessons: Schema.Array(LessonView),
  /**
   * The published grammar notes this skill teaches, in the learner's own
   * language, in order. A lesson shows the first the learner has not
   * dismissed, and the check bar names it again after a wrong answer
   * (docs/GRAMMAR.md section 1). Empty for a skill that teaches no rule.
   */
  grammarNotes: Schema.Array(GrammarNoteView),
});

/** A unit plus everything its exercises reference, hydrated for one source language. */
export const UnitResponse = Schema.Struct({
  unit: Schema.Struct({ ...UnitSummary.fields, skills: Schema.Array(SkillView) }),
  sourceLang: SourceLangSchema,
  lexemes: Schema.Record({ key: Schema.String, value: LexemeView }),
  sentences: Schema.Record({ key: Schema.String, value: SentenceView }),
  audioAssets: Schema.Record({ key: Schema.String, value: AudioRef }),
  /**
   * The bare-click recordings a `click_identify` plays, keyed by
   * `CLICK_SOUNDS` id: published tier-1 studio takes only, never another
   * tier. A click with no published take is simply absent. Optional so a
   * unit cached on a device before the field existed still decodes.
   */
  clickAudio: Schema.optional(Schema.Record({ key: Schema.String, value: AudioRef })),
  /**
   * The lexemes this unit's exercises teach that this learner has not met in
   * a finished lesson: the same history `moment` is computed from, answered
   * by `unseenAmong`. The lesson runner meets each of them on a new-word card
   * before the first exercise that asks for its meaning. Signed-in learners
   * only: absent for a guest, whose device answers the same question from
   * the lessons it keeps. Optional so an app build that predates the field
   * ignores it and a unit cached before it existed still decodes.
   */
  unseenLexemeIds: Schema.optional(Schema.Array(Uuid)),
});
export type UnitResponse = typeof UnitResponse.Type;

// ---------------------------------------------------------------------------
// The path (docs/DESIGN.md "The path")
// ---------------------------------------------------------------------------

/** What a lesson node draws: derived from its exercises by `lessonKindOf`. */
export const LessonKindSchema = Schema.Literal(...LESSON_KINDS);

/**
 * One lesson node. Light on purpose: the whole path is loaded at once, so
 * it carries no payloads, no glosses and no audio — those come from
 * `/units/:slug` when a lesson is actually opened.
 */
export const PathLesson = Schema.Struct({
  id: Uuid,
  order: Schema.Int,
  estimatedMinutes: Schema.Int,
  exerciseCount: Schema.Int,
  kind: LessonKindSchema,
  /** Times this learner has finished it, capped at MAX_CROWN_LEVEL. 0 for a guest. */
  crownLevel: Schema.Int,
});
export type PathLesson = typeof PathLesson.Type;

export const PathSkill = Schema.Struct({
  id: Uuid,
  slug: Slug,
  titleKey: Schema.String,
  order: Schema.Int,
  kind: SkillKindSchema,
  lessons: Schema.Array(PathLesson),
  /** The end-of-skill chest: true once this learner has taken it. Always false for a guest. */
  chestClaimed: Schema.Boolean,
});
export type PathSkill = typeof PathSkill.Type;

export const PathUnit = Schema.Struct({ ...UnitSummary.fields, skills: Schema.Array(PathSkill) });
export type PathUnit = typeof PathUnit.Type;

/** Every published unit as one continuous path, with this learner's state on it. */
export const PathResponse = Schema.Struct({
  units: Schema.Array(PathUnit),
  /** XP one chest grants, so a client can promise the right number before claiming. */
  chestXp: Schema.Int,
});
export type PathResponse = typeof PathResponse.Type;

// ---------------------------------------------------------------------------
// Learner progress and review (ARCHITECTURE section 4)
// ---------------------------------------------------------------------------

export const HeartsState = Schema.Struct({
  hearts: Schema.Int,
  max: Schema.Int,
  unlimited: Schema.Boolean,
  nextRegenAt: Schema.NullOr(Schema.String),
  practiceLeft: Schema.Int,
});
export type HeartsState = typeof HeartsState.Type;

export const PlanView = Schema.Struct({
  plan: Schema.Literal("free", "plus"),
  expiresAt: Schema.NullOr(Schema.String),
  source: Schema.NullOr(Schema.String),
});
export type PlanView = typeof PlanView.Type;

export const ProgressResponse = Schema.Struct({
  xpTotal: Schema.Int,
  level: Schema.Int,
  xpToday: Schema.Int,
  dailyGoalXp: Schema.Int,
  hearts: HeartsState,
  plan: PlanView,
  streak: Schema.Struct({
    current: Schema.Int,
    longest: Schema.Int,
    lastActiveDate: Schema.NullOr(Schema.String),
    freezeAvailable: Schema.Boolean,
    lastFrozenDate: Schema.NullOr(Schema.String),
  }),
  dueCount: Schema.Int,
});
export type ProgressResponse = typeof ProgressResponse.Type;

/** The client's local calendar date, so streaks follow the learner's midnight. */
export const LocalDate = Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/));

export const PrefsRequest = Schema.Struct({
  sourceLang: Schema.optional(SourceLangSchema),
  /** Which course the learner is studying. Must be a published course; null means the default one. */
  courseId: Schema.optional(Schema.NullOr(Uuid)),
  dailyGoalXp: Schema.optional(Schema.Int.pipe(Schema.between(10, 500))),
  reminderOptIn: Schema.optional(Schema.Boolean),
  /** Off: listening exercises run in their quiet (read) variant. */
  listeningEnabled: Schema.optional(Schema.Boolean),
  /** Off: speaking exercises are skipped. */
  speakingEnabled: Schema.optional(Schema.Boolean),
  /** True marks onboarding as done (or skipped); never unset by a client. */
  onboarded: Schema.optional(Schema.Literal(true)),
  preferredVoice: Schema.optional(VoicePreference),
});

export const PrefsView = Schema.Struct({
  sourceLang: SourceLangSchema,
  /** Null means "the default course"; `/me` reports the resolved enrolment separately. */
  courseId: Schema.NullOr(Uuid),
  dailyGoalXp: Schema.Int,
  reminderOptIn: Schema.Boolean,
  listeningEnabled: Schema.Boolean,
  speakingEnabled: Schema.Boolean,
  onboardedAt: Schema.NullOr(Schema.String),
  preferredVoice: VoicePreference,
});
export type PrefsView = typeof PrefsView.Type;
export const DEFAULT_PREFS: PrefsView = {
  sourceLang: "en",
  courseId: null,
  dailyGoalXp: 50,
  reminderOptIn: false,
  listeningEnabled: true,
  speakingEnabled: true,
  onboardedAt: null,
  preferredVoice: "any",
};
export type PrefsRequest = typeof PrefsRequest.Type;

// ---------------------------------------------------------------------------
// Push notifications (streak reminders on mobile)
// ---------------------------------------------------------------------------

export const PUSH_PLATFORMS = ["ios", "android"] as const;
export const PushPlatformSchema = Schema.Literal(...PUSH_PLATFORMS);
export type PushPlatform = typeof PushPlatformSchema.Type;

/**
 * An Expo push token as the device reports it. Only the length is checked:
 * the shape ("ExponentPushToken[...]") is Expo's to change, and a token the
 * push service rejects is disabled by the sender, not by this boundary.
 */
export const ExpoPushToken = Schema.String.pipe(Schema.minLength(8), Schema.maxLength(512));

/** POST /me/push-token — register or refresh this device. Idempotent on `token`. */
export const PushTokenRequest = Schema.Struct({
  token: ExpoPushToken,
  platform: PushPlatformSchema,
  /** The app build the token came from, for triage; never required. */
  appVersion: Schema.optional(Schema.String.pipe(Schema.maxLength(32))),
});
export type PushTokenRequest = typeof PushTokenRequest.Type;

/** DELETE /me/push-token — this device on sign-out, or every device when the token is omitted. */
export const PushTokenDeleteRequest = Schema.Struct({
  token: Schema.optional(ExpoPushToken),
});
export type PushTokenDeleteRequest = typeof PushTokenDeleteRequest.Type;

/**
 * POST /me/apple/authorization-code — the one-time code from the native Sign
 * in with Apple sheet, exchanged server-side for the refresh token that
 * account deletion revokes. Apple's codes are short opaque strings.
 */
export const AppleAuthorizationCodeRequest = Schema.Struct({
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
});
export type AppleAuthorizationCodeRequest = typeof AppleAuthorizationCodeRequest.Type;
/** One wrong answer, reported by the runner so the learner can practise it later. */
export const MistakeEntry = Schema.Struct({
  lexemeId: Uuid,
  exerciseType: ExerciseTypeSchema,
});
export type MistakeEntry = typeof MistakeEntry.Type;

/** A lesson has at most a few dozen exercises; the cap keeps a client honest. */
export const MAX_MISTAKES_PER_LESSON = 40;

/**
 * Minutes to add to the learner's local time to reach UTC, exactly as
 * `Date.prototype.getTimezoneOffset()` reports it: -120 in Oslo in summer.
 * Sent beside `today`, because a local date alone does not say when that
 * day began. Optional, and absent means UTC, which is what the server
 * assumed before this existed.
 */
export const TzOffsetMinutes = Schema.Int.pipe(Schema.between(-840, 840));

export const LessonCompleteRequest = Schema.Struct({
  correct: Schema.Int.pipe(Schema.nonNegative()),
  total: Schema.Int.pipe(Schema.nonNegative()),
  clickDrillCorrect: Schema.optional(Schema.Int.pipe(Schema.nonNegative())),
  /** Lexemes answered wrong in this lesson; the server keeps only those the lesson actually teaches. */
  mistakes: Schema.optional(
    Schema.Array(MistakeEntry).pipe(Schema.maxItems(MAX_MISTAKES_PER_LESSON)),
  ),
  today: LocalDate,
  tzOffsetMinutes: Schema.optional(TzOffsetMinutes),
});
export type LessonCompleteRequest = typeof LessonCompleteRequest.Type;

/** A guest's local progress, replayed once per lesson when they create an account. */
export const ImportProgressRequest = Schema.Struct({
  lessons: Schema.Array(
    Schema.Struct({
      lessonId: Uuid,
      correct: Schema.Int.pipe(Schema.nonNegative()),
      total: Schema.Int.pipe(Schema.positive()),
      today: LocalDate,
    }),
  ).pipe(Schema.maxItems(50)),
  /** Skills whose chest the guest opened on the device; re-claimed once each. */
  chests: Schema.optional(Schema.Array(Uuid).pipe(Schema.maxItems(50))),
});
export type ImportProgressRequest = typeof ImportProgressRequest.Type;

/**
 * The facts a client needs for the celebration sequence after a lesson
 * (docs/DESIGN.md "After a lesson"). Everything here is about *this*
 * completion, not about the learner in general, which is why it rides on
 * the lesson response rather than on `ProgressResponse`: whether the streak
 * moved on today, how many words the learner had met before and after, and
 * the unit this lesson just finished. The beat-selection rules that read it
 * are the pure `celebrationBeats` in `./celebration.ts`.
 */
export const LessonCelebration = Schema.Struct({
  /** The streak grew with this lesson; false when the learner was already active today. */
  streakExtended: Schema.Boolean,
  streakDays: Schema.Int,
  /** A Plus freeze covered a missed day, so the streak was saved rather than extended. */
  streakFrozen: Schema.Boolean,
  /** Monday first: the days of this week with activity, today included. */
  streakWeek: Schema.Array(Schema.Boolean),
  /** Index of today in `streakWeek`; 0 is Monday. */
  streakTodayIndex: Schema.Int,
  /** Distinct lexemes this learner has met, after this lesson. */
  wordsLearned: Schema.Int,
  /** ...and before it, so a client can tell which round number was crossed. */
  wordsLearnedBefore: Schema.Int,
  /** Set only when this lesson was the last unfinished one of its unit. */
  unitCompleted: Schema.NullOr(
    Schema.Struct({
      slug: Slug,
      titleKey: Schema.String,
      /** Every lesson of the unit was finished without a wrong answer. */
      flawless: Schema.Boolean,
    }),
  ),
});
export type LessonCelebration = typeof LessonCelebration.Type;

export const LessonCompleteResponse = Schema.Struct({
  xp: Schema.Int,
  perfect: Schema.Boolean,
  cardsCreated: Schema.Int,
  progress: ProgressResponse,
  celebration: LessonCelebration,
});
export type LessonCompleteResponse = typeof LessonCompleteResponse.Type;

/**
 * The answer to a chest claim. A second claim is not an error — the client
 * may have retried, or a guest may be replaying a chest they already took —
 * but it grants nothing and says so.
 */
export const ChestClaimResponse = Schema.Struct({
  skillId: Uuid,
  xp: Schema.Int,
  alreadyClaimed: Schema.Boolean,
  progress: ProgressResponse,
});
export type ChestClaimResponse = typeof ChestClaimResponse.Type;

export const CardStateSchema = Schema.Literal("new", "learning", "review", "relearning");

export const ReviewCardView = Schema.Struct({
  cardId: Uuid,
  lexemeId: Uuid,
  state: CardStateSchema,
  dueAt: Schema.String,
  reps: Schema.Int,
  lapses: Schema.Int,
  stability: Schema.Number,
});

export const ReviewSessionResponse = Schema.Struct({
  sourceLang: SourceLangSchema,
  due: Schema.Array(ReviewCardView),
  fresh: Schema.Array(ReviewCardView),
  dueTotal: Schema.Int,
  lexemes: Schema.Record({ key: Schema.String, value: LexemeView }),
});
export type ReviewSessionResponse = typeof ReviewSessionResponse.Type;

export const RatingSchema = Schema.Literal(1, 2, 3, 4);

export const ReviewRequest = Schema.Struct({
  rating: RatingSchema,
  today: LocalDate,
  tzOffsetMinutes: Schema.optional(TzOffsetMinutes),
});
export type ReviewRequest = typeof ReviewRequest.Type;

export const ReviewResponseHearts = HeartsState;

export const ReviewResponse = Schema.Struct({
  /** Present for signed-in learners: practice earns hearts back. */
  hearts: Schema.optional(HeartsState),
  heartEarned: Schema.optional(Schema.Boolean),
  card: ReviewCardView,
  xp: Schema.Int,
  progress: ProgressResponse,
});
export type ReviewResponse = typeof ReviewResponse.Type;

// ---------------------------------------------------------------------------
// Practise mistakes
// ---------------------------------------------------------------------------

/**
 * One open mistake: the word, how it was missed, and how often. The lexeme
 * is hydrated exactly as the review session hydrates it (published rows
 * only, glosses in the learner's source language, voices in preference
 * order), so the mistakes session can reuse the review UI unchanged.
 */
export const MistakeView = Schema.Struct({
  lexemeId: Uuid,
  exerciseType: ExerciseTypeSchema,
  timesWrong: Schema.Int,
  lastWrongAt: Schema.String,
  lexeme: LexemeView,
});
export type MistakeView = typeof MistakeView.Type;

export const MistakesResponse = Schema.Struct({
  sourceLang: SourceLangSchema,
  /** Open mistakes for this learner, including any the page did not fit. */
  count: Schema.Int,
  mistakes: Schema.Array(MistakeView),
});
export type MistakesResponse = typeof MistakesResponse.Type;

/**
 * One answer in a mistakes session. Right clears the row, wrong bumps the
 * counter. Remediation never costs a heart (docs/MONETISATION.md: hearts
 * are a lesson mechanic).
 */
export const MistakePractiseRequest = Schema.Struct({
  lexemeId: Uuid,
  exerciseType: Schema.optional(ExerciseTypeSchema),
  correct: Schema.Boolean,
  today: LocalDate,
  tzOffsetMinutes: Schema.optional(TzOffsetMinutes),
});
export type MistakePractiseRequest = typeof MistakePractiseRequest.Type;

export const MistakePractiseResponse = Schema.Struct({
  cleared: Schema.Boolean,
  timesWrong: Schema.Int,
  /** Mistakes still open after this answer. */
  remaining: Schema.Int,
  xp: Schema.Int,
  progress: ProgressResponse,
});
export type MistakePractiseResponse = typeof MistakePractiseResponse.Type;

// ---------------------------------------------------------------------------
// Reporting an exercise
// ---------------------------------------------------------------------------

/**
 * Why a learner is reporting an exercise. A closed list, because it is the
 * editor's triage filter and because a free-text-only report is a report
 * nobody reads. `note` is the learner's own words and is optional.
 */
export const EXERCISE_REPORT_REASONS = [
  "wrong_gloss",
  "wrong_answer",
  "audio_problem",
  "typo",
  "other",
] as const;
export const ExerciseReportReasonSchema = Schema.Literal(...EXERCISE_REPORT_REASONS);
export type ExerciseReportReason = typeof ExerciseReportReasonSchema.Type;

/** A learner's note is a sentence, not an essay: long enough to be useful, short enough to read. */
export const EXERCISE_REPORT_NOTE_MAX = 500;

/** POST /learn/exercises/:id/report — one report from the check bar. */
export const ExerciseReportRequest = Schema.Struct({
  reason: ExerciseReportReasonSchema,
  note: Schema.optional(Schema.String.pipe(Schema.maxLength(EXERCISE_REPORT_NOTE_MAX))),
});
export type ExerciseReportRequest = typeof ExerciseReportRequest.Type;

export const ExerciseReportResponse = Schema.Struct({
  ok: Schema.Literal(true),
  /** Reports this learner has open on this exercise, so a second tap is not a second thank-you. */
  alreadyReported: Schema.Boolean,
});
export type ExerciseReportResponse = typeof ExerciseReportResponse.Type;

/** One report as the editor's review queue shows it. Never carries the reporter's name or email. */
export const ExerciseReportItem = Schema.Struct({
  id: Uuid,
  exerciseId: Uuid,
  exerciseType: ExerciseTypeSchema,
  /** The exercise's own status, so an editor can tell a live problem from a draft one. */
  exerciseStatus: StatusSchema,
  reason: ExerciseReportReasonSchema,
  note: Schema.NullOr(Schema.String),
  sourceLang: SourceLangSchema,
  createdAt: Schema.String,
  resolvedAt: Schema.NullOr(Schema.String),
});
export type ExerciseReportItem = typeof ExerciseReportItem.Type;

export const ExerciseReportsResponse = Schema.Struct({
  reports: Schema.Array(ExerciseReportItem),
  /** Open reports in total, including any this page did not fit. */
  openCount: Schema.Int,
});
export type ExerciseReportsResponse = typeof ExerciseReportsResponse.Type;

/** POST /edit/reports/:id/resolve — an editor has looked at it. Never changes content status. */
export const ResolveExerciseReportRequest = Schema.Struct({
  resolved: Schema.Boolean,
});
export type ResolveExerciseReportRequest = typeof ResolveExerciseReportRequest.Type;

// ---------------------------------------------------------------------------
// Editor writes
// ---------------------------------------------------------------------------

export const OriginSchema = Schema.Literal("human", "llm");

export const CreateLexemeRequest = Schema.Struct({
  lemma: Schema.NonEmptyString,
  pos: Schema.NonEmptyString,
  nounClassLabel: Schema.optional(Schema.NullOr(NounClassLabelSchema)),
  isPlural: Schema.optional(Schema.Boolean),
  infinitive: Schema.optional(Schema.NullOr(Schema.String)),
  register: Schema.optional(RegisterSchema),
  cefrBand: Schema.optional(Schema.NullOr(CefrBandSchema)),
  frequencyRank: Schema.optional(Schema.NullOr(Schema.Int)),
  source: Schema.NonEmptyString,
  sourceRef: Schema.optional(Schema.NullOr(Schema.String)),
  licence: LicenceSchema,
  origin: OriginSchema,
});
export type CreateLexemeRequest = typeof CreateLexemeRequest.Type;

export const PatchLexemeRequest = Schema.partial(
  Schema.Struct({
    lemma: Schema.NonEmptyString,
    pos: Schema.NonEmptyString,
    nounClassLabel: Schema.NullOr(NounClassLabelSchema),
    isPlural: Schema.Boolean,
    infinitive: Schema.NullOr(Schema.String),
    register: RegisterSchema,
    cefrBand: Schema.NullOr(CefrBandSchema),
    frequencyRank: Schema.NullOr(Schema.Int),
    sourceRef: Schema.NullOr(Schema.String),
    licence: LicenceSchema,
    tonePattern: Schema.NullOr(Schema.String),
  }),
);
export type PatchLexemeRequest = typeof PatchLexemeRequest.Type;

export const UpsertGlossRequest = Schema.Struct({
  gloss: Schema.NonEmptyString,
  usageNote: Schema.optional(Schema.NullOr(Schema.String)),
  contrastiveNote: Schema.optional(Schema.NullOr(Schema.String)),
  origin: OriginSchema,
});
export type UpsertGlossRequest = typeof UpsertGlossRequest.Type;

export const CreateSpeakerRequest = Schema.Struct({
  displayName: Schema.NonEmptyString,
  region: Schema.optional(Schema.NullOr(Schema.String)),
  dialectNote: Schema.optional(Schema.NullOr(Schema.String)),
  gender: Schema.optional(Schema.NullOr(Schema.String)),
  ageGroup: Schema.optional(Schema.NullOr(AgeGroupSchema)),
  /** Recorded from the signed form; never inferred (CONTENT.md section 3). */
  consentScope: Schema.Literal("internal", "published", "commercial"),
  consentDocumentKey: Schema.optional(Schema.NullOr(Schema.String)),
});
export type CreateSpeakerRequest = typeof CreateSpeakerRequest.Type;

export const EntityKindSchema = Schema.Literal(
  "lexeme",
  "gloss",
  "sentence",
  "sentence_gloss",
  "audio_asset",
  "exercise",
  "lesson",
  "skill",
  "unit",
  "grammar_note",
  "grammar_note_body",
);

// ---------------------------------------------------------------------------
// Grammar notes (docs/GRAMMAR.md)
// ---------------------------------------------------------------------------

/**
 * `origin` is what decides the starting status, exactly as it does for a
 * gloss: `llm` enters at `ai_draft` and has no route to `published` that does
 * not pass a human editor. `caveat` is what that editor is being asked to
 * check about the *claim*, over and above whether the prose reads well.
 */
export const CreateGrammarNoteRequest = Schema.Struct({
  skillId: Uuid,
  slug: Slug,
  order: Schema.optional(Schema.Int),
  caveat: Schema.optional(Schema.NullOr(Schema.String)),
  origin: Schema.optional(Schema.Literal("human", "llm")),
});
export type CreateGrammarNoteRequest = typeof CreateGrammarNoteRequest.Type;

export const PatchGrammarNoteRequest = Schema.partial(
  CreateGrammarNoteRequest.omit("skillId", "origin"),
);
export type PatchGrammarNoteRequest = typeof PatchGrammarNoteRequest.Type;

export const UpsertGrammarNoteBodyRequest = Schema.Struct({
  sourceLang: SourceLangSchema,
  title: Schema.NonEmptyString,
  rule: Schema.NonEmptyString,
  correction: Schema.optional(Schema.NullOr(Schema.String)),
  origin: Schema.optional(Schema.Literal("human", "llm")),
});
export type UpsertGrammarNoteBodyRequest = typeof UpsertGrammarNoteBodyRequest.Type;

/**
 * `surfaceForm` is written by whoever fills the note in. Nothing at this
 * boundary can tell a form taken from the lexicon from one a model invented,
 * which is exactly why `molo content grammar` — the only automated writer —
 * takes every form from the lexicon verbatim or from `xh-morph` and refuses
 * anything it cannot get from one of the two.
 */
export const GrammarCellRequest = Schema.Struct({
  role: GrammarCellRoleSchema,
  order: Schema.Int,
  rowLabel: Schema.optional(Schema.String),
  colKey: Schema.NonEmptyString,
  surfaceForm: Schema.NonEmptyString,
  morphemes: Schema.optional(Schema.Array(Schema.String)),
  lexemeId: Schema.optional(Schema.NullOr(Uuid)),
  audioAssetId: Schema.optional(Schema.NullOr(Uuid)),
});
export type GrammarCellRequest = typeof GrammarCellRequest.Type;

/** Replaces the note's cells wholesale, so an edit never leaves half a paradigm. */
export const SetGrammarCellsRequest = Schema.Struct({
  cells: Schema.Array(GrammarCellRequest),
});
export type SetGrammarCellsRequest = typeof SetGrammarCellsRequest.Type;

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

export const LeagueTierSchema = Schema.Literal("bronze", "silver", "gold", "sapphire", "ruby");
export type LeagueTier = typeof LeagueTierSchema.Type;
export const LeagueOutcomeSchema = Schema.Literal("promoted", "stayed", "demoted");

export const LeagueResponse = Schema.Struct({
  league: Schema.NullOr(
    Schema.Struct({
      id: Uuid,
      tier: LeagueTierSchema,
      weekStart: LocalDate,
      weekEnd: LocalDate,
      size: Schema.Int,
    }),
  ),
  standings: Schema.Array(
    Schema.Struct({
      userId: Schema.String,
      /** Null when the name is held back: hidden by you, caught by the name filter, or reported. */
      name: Schema.NullOr(Schema.String),
      /** You hid this learner; the row stays so ranks still add up. */
      hidden: Schema.Boolean,
      xp: Schema.Int,
      rank: Schema.Int,
      isMe: Schema.Boolean,
    }),
  ),
  me: Schema.NullOr(
    Schema.Struct({
      rank: Schema.Int,
      xp: Schema.Int,
      zone: Schema.Literal("promote", "stay", "demote"),
    }),
  ),
  rules: Schema.Struct({ size: Schema.Int, promote: Schema.Int, demote: Schema.Int }),
});
export type LeagueResponse = typeof LeagueResponse.Type;

export const LeagueHistoryResponse = Schema.Struct({
  weeks: Schema.Array(
    Schema.Struct({
      weekStart: LocalDate,
      tier: LeagueTierSchema,
      rank: Schema.NullOr(Schema.Int),
      xp: Schema.NullOr(Schema.Int),
      outcome: Schema.NullOr(LeagueOutcomeSchema),
    }),
  ),
});
export type LeagueHistoryResponse = typeof LeagueHistoryResponse.Type;

// ---------------------------------------------------------------------------
// Editor writes: curriculum
// ---------------------------------------------------------------------------

export const CreateUnitRequest = Schema.Struct({
  /** The curriculum this unit belongs to. Omitted means the default course. */
  courseId: Schema.optional(Uuid),
  slug: Slug,
  titleKey: Schema.NonEmptyString,
  order: Schema.Int,
  cefrBand: CefrBandSchema,
  prerequisiteUnitId: Schema.optional(Schema.NullOr(Uuid)),
});
export type CreateUnitRequest = typeof CreateUnitRequest.Type;

/** A unit never changes course: its exercises reference that course's language. */
export const PatchUnitRequest = Schema.partial(CreateUnitRequest.omit("courseId"));
export type PatchUnitRequest = typeof PatchUnitRequest.Type;

export const CreateSkillRequest = Schema.Struct({
  unitId: Uuid,
  slug: Slug,
  titleKey: Schema.NonEmptyString,
  order: Schema.Int,
  kind: SkillKindSchema,
});
export type CreateSkillRequest = typeof CreateSkillRequest.Type;

export const PatchSkillRequest = Schema.partial(CreateSkillRequest.omit("unitId"));
export type PatchSkillRequest = typeof PatchSkillRequest.Type;

export const CreateLessonRequest = Schema.Struct({
  skillId: Uuid,
  order: Schema.Int,
  estimatedMinutes: Schema.optional(Schema.Int.pipe(Schema.between(1, 60))),
});
export type CreateLessonRequest = typeof CreateLessonRequest.Type;

export const PatchLessonRequest = Schema.partial(CreateLessonRequest.omit("skillId"));
export type PatchLessonRequest = typeof PatchLessonRequest.Type;

/** `payload` is validated against the schema for `type` in the repository, not here. */
export const CreateExerciseRequest = Schema.Struct({
  lessonId: Uuid,
  order: Schema.Int,
  type: ExerciseTypeSchema,
  payload: Schema.Unknown,
  note: Schema.optional(Schema.NullOr(Schema.String)),
});
export type CreateExerciseRequest = typeof CreateExerciseRequest.Type;

export const PatchExerciseRequest = Schema.partial(CreateExerciseRequest.omit("lessonId"));
export type PatchExerciseRequest = typeof PatchExerciseRequest.Type;

export const CurriculumKindSchema = Schema.Literal("unit", "skill", "lesson", "exercise");
export type CurriculumKind = typeof CurriculumKindSchema.Type;

export const TransitionRequest = Schema.Struct({
  kind: EntityKindSchema,
  id: Uuid,
  to: StatusSchema,
  note: Schema.optional(Schema.String),
});
export type TransitionRequest = typeof TransitionRequest.Type;

/**
 * A speaker's or editor's note on a word, a sentence or a bare click,
 * whatever its status: "this gloss is wrong", "the prefix is missing". It
 * changes nothing; it lands in the row's history, and the editor landing
 * page lists the latest ones. A click's id is its `CLICK_SOUNDS` id.
 */
export const CONTENT_NOTE_MAX = 1000;
export const ContentNoteRequest = Schema.Struct({
  kind: Schema.Literal("lexeme", "sentence", "click"),
  id: Uuid,
  note: Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(CONTENT_NOTE_MAX)),
});
export type ContentNoteRequest = typeof ContentNoteRequest.Type;

export interface ContentNote {
  readonly kind: "lexeme" | "sentence" | "click";
  readonly id: string;
  /** The lemma or sentence text, as it reads now. */
  readonly text: string;
  readonly note: string;
  readonly authorName: string | null;
  readonly at: string;
}

export const GateFailureSchema = Schema.Struct({
  code: Schema.String,
  detail: Schema.optional(Schema.String),
});
export const GateResultSchema = Schema.Struct({
  ok: Schema.Boolean,
  failures: Schema.Array(GateFailureSchema),
});

export const TransitionResponse = Schema.Union(
  Schema.Struct({ ok: Schema.Literal(true), status: StatusSchema }),
  Schema.Struct({
    ok: Schema.Literal(false),
    reason: Schema.String,
    gate: Schema.optional(GateResultSchema),
  }),
);
export type TransitionResponse = typeof TransitionResponse.Type;

/**
 * A batch of transitions from the content grid. There is no bulk shortcut:
 * the server applies the same per-row edge, four-eyes and gate rules as a
 * single transition, one row at a time, and reports each row's outcome.
 * `ai_draft → published` is refused here exactly as it is refused per row.
 */
export const BULK_TRANSITION_MAX = 200;
export const BulkTransitionRequest = Schema.Struct({
  ids: Schema.Array(Uuid).pipe(Schema.minItems(1), Schema.maxItems(BULK_TRANSITION_MAX)),
  to: StatusSchema,
  /** Required by the status machine for `draft` and `retired`, as per row. */
  note: Schema.optional(Schema.String),
});
export type BulkTransitionRequest = typeof BulkTransitionRequest.Type;

export const BulkTransitionOutcome = Schema.Union(
  Schema.Struct({ id: Uuid, ok: Schema.Literal(true), status: StatusSchema }),
  Schema.Struct({
    id: Uuid,
    ok: Schema.Literal(false),
    reason: Schema.String,
    gate: Schema.optional(GateResultSchema),
  }),
);
export type BulkTransitionOutcome = typeof BulkTransitionOutcome.Type;

export const BulkTransitionResponse = Schema.Struct({
  results: Schema.Array(BulkTransitionOutcome),
  applied: Schema.Int,
  blocked: Schema.Int,
});
export type BulkTransitionResponse = typeof BulkTransitionResponse.Type;

/**
 * Approve and publish many review-queue rows at once, of any kind. The server
 * orders them so what a row depends on goes first (audio and glosses before
 * the word, words before exercises, lessons before skills before units), and
 * each goes through the same transition, gate and four-eyes rule as one.
 */
export const REVIEW_APPROVE_ORDER = [
  "audio_asset",
  "gloss",
  "sentence_gloss",
  "lexeme",
  "sentence",
  "grammar_note_body",
  "grammar_note",
  "exercise",
  "lesson",
  "skill",
  "unit",
] as const;

export const ReviewApproveRequest = Schema.Struct({
  items: Schema.Array(Schema.Struct({ kind: EntityKindSchema, id: Uuid })).pipe(
    Schema.minItems(1),
    Schema.maxItems(BULK_TRANSITION_MAX),
  ),
});
export type ReviewApproveRequest = typeof ReviewApproveRequest.Type;

export interface ReviewApproveOutcome {
  readonly kind: string;
  readonly id: string;
  readonly ok: boolean;
  readonly reason?: string;
}
export interface ReviewApproveResponse {
  readonly results: readonly ReviewApproveOutcome[];
  readonly published: number;
  readonly blocked: number;
}

// ---------------------------------------------------------------------------
// Review-queue assignment
// ---------------------------------------------------------------------------

/** Whose queue to show. `mine` is the signed-in editor's own assignments. */
export const ReviewQueueFilterSchema = Schema.Literal("all", "mine", "unassigned");
export type ReviewQueueFilter = typeof ReviewQueueFilterSchema.Type;

/**
 * Claim, release or hand over one review item. `assignedTo: null` releases
 * it. Handing an item to somebody else is an admin action; an editor may
 * claim an unassigned item and release their own.
 */
export const AssignReviewRequest = Schema.Struct({
  kind: EntityKindSchema,
  id: Uuid,
  assignedTo: Schema.NullOr(Schema.String),
});
export type AssignReviewRequest = typeof AssignReviewRequest.Type;

export const ReviewQueueItem = Schema.Struct({
  entityKind: EntityKindSchema,
  entityId: Uuid,
  label: Schema.String,
  /** Set for a bare-click recording: the click letter it was recorded against. */
  clickLetter: Schema.optional(Schema.NullOr(Schema.String)),
  status: StatusSchema,
  createdBy: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
  assignedTo: Schema.NullOr(Schema.String),
  assignedToName: Schema.NullOr(Schema.String),
  assignedAt: Schema.NullOr(Schema.String),
  assignedBy: Schema.NullOr(Schema.String),
  assignedByName: Schema.NullOr(Schema.String),
  priority: Schema.Int,
  notes: Schema.NullOr(Schema.String),
});
export type ReviewQueueItem = typeof ReviewQueueItem.Type;

/** The editors an admin can hand an item to. Never includes learners. */
export const EditorRef = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  roles: Schema.Array(RoleSchema),
});
export type EditorRef = typeof EditorRef.Type;

export const AudioUploadFields = Schema.Struct({
  targetKind: Schema.Literal(...AUDIO_TARGET_KINDS),
  targetId: Uuid,
  speakerId: Schema.optional(Uuid),
  tier: AudioTierSchema,
  licence: LicenceSchema,
});
export type AudioUploadFields = typeof AudioUploadFields.Type;

export const AudioUploadResponse = Schema.Struct({
  jobId: Schema.String,
  uploadKey: Schema.String,
  queued: Schema.Boolean,
});

export const ApiError = Schema.Struct({
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String,
    details: Schema.optional(Schema.Unknown),
  }),
});

// ---------------------------------------------------------------------------
// Queue messages (ARCHITECTURE section 5; every message decoded on receipt)
// ---------------------------------------------------------------------------

/** audio-process: an upload waiting for xh-audio. Consumed by the Bun worker via Queues pull. */
export const AudioProcessMessage = Schema.Struct({
  kind: Schema.Literal("audio.process"),
  uploadKey: Schema.String,
  originalFilename: Schema.String,
  targetKind: Schema.Literal(...AUDIO_TARGET_KINDS),
  targetId: Uuid,
  speakerId: Schema.NullOr(Uuid),
  tier: AudioTierSchema,
  licence: LicenceSchema,
  uploadedBy: Schema.String,
  uploadedAt: Schema.String,
});
export type AudioProcessMessage = typeof AudioProcessMessage.Type;

/** ingest: a corpus adapter run requested from the CLI or dashboard. */
export const IngestMessage = Schema.Struct({
  kind: Schema.Literal("ingest.run"),
  adapter: Schema.Literal("isixhosa-click", "vukuzenzele"),
  requestedBy: Schema.String,
  live: Schema.Boolean,
});

/** forvo-backfill: one lexeme to look up; rate-limited by the consumer. */
export const ForvoBackfillMessage = Schema.Struct({
  kind: Schema.Literal("forvo.backfill"),
  lexemeId: Uuid,
  lemma: Schema.String,
  requestedBy: Schema.String,
});

export const QueueMessage = Schema.Union(AudioProcessMessage, IngestMessage, ForvoBackfillMessage);
export type QueueMessage = typeof QueueMessage.Type;
export const decodeQueueMessage = Schema.decodeUnknownEither(QueueMessage);

// ---------------------------------------------------------------------------
// Sentence builder (ARCHITECTURE section 7)
// ---------------------------------------------------------------------------

export const CreateSentenceRequest = Schema.Struct({
  /** Stored exactly as typed by the editor; the builder never composes isiXhosa itself. */
  textXh: Schema.NonEmptyString,
  register: Schema.optional(RegisterSchema),
  cefrBand: Schema.optional(Schema.NullOr(CefrBandSchema)),
  grammarTags: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  source: Schema.NonEmptyString,
  sourceRef: Schema.optional(Schema.NullOr(Schema.String)),
  licence: LicenceSchema,
  origin: OriginSchema,
});
export type CreateSentenceRequest = typeof CreateSentenceRequest.Type;

export const PatchSentenceRequest = Schema.partial(
  Schema.Struct({
    textXh: Schema.NonEmptyString,
    register: RegisterSchema,
    cefrBand: Schema.NullOr(CefrBandSchema),
    grammarTags: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    sourceRef: Schema.NullOr(Schema.String),
    licence: LicenceSchema,
  }),
);
export type PatchSentenceRequest = typeof PatchSentenceRequest.Type;

/** One token as the editor assembles it; position is the array index. `morphVerified` is never accepted from a client. */
export const SentenceTokenInput = Schema.Struct({
  lexemeId: Uuid,
  surfaceForm: Schema.NonEmptyString,
  irregular: Schema.optional(Schema.Boolean),
  irregularNote: Schema.optional(Schema.NullOr(Schema.String)),
});
export type SentenceTokenInput = typeof SentenceTokenInput.Type;

export const SentenceTokensRequest = Schema.Struct({
  tokens: Schema.Array(SentenceTokenInput).pipe(Schema.maxItems(40)),
});
export type SentenceTokensRequest = typeof SentenceTokensRequest.Type;

export const UpsertSentenceGlossRequest = Schema.Struct({
  gloss: Schema.NonEmptyString,
  literalGloss: Schema.optional(Schema.NullOr(Schema.String)),
  origin: OriginSchema,
});
export type UpsertSentenceGlossRequest = typeof UpsertSentenceGlossRequest.Type;

/**
 * What xh-morph says about one token's surface form. `verified` is the only
 * state that satisfies the publish gate by itself; `unverified` needs the
 * editor to mark the token irregular with a note; `mismatch` means the form
 * disagrees with a generated one and should be looked at.
 */
export const TokenVerificationState = Schema.Literal("verified", "unverified", "mismatch");
export type TokenVerificationState = typeof TokenVerificationState.Type;

export const TokenVerification = Schema.Struct({
  position: Schema.Int,
  lexemeId: Uuid,
  surfaceForm: Schema.String,
  state: TokenVerificationState,
  /** Which generated form matched: the lemma itself, or the class plural. */
  matched: Schema.NullOr(Schema.Literal("lemma", "plural")),
  /** The plural xh-morph generated for comparison, if it could. */
  expectedPlural: Schema.NullOr(Schema.String),
  reason: Schema.NullOr(Schema.String),
});
export type TokenVerification = typeof TokenVerification.Type;
