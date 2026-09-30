import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { courses, skills } from "./curriculum.ts";
import { cardStateEnum, exerciseTypeEnum, sourceLangEnum } from "./enums.ts";
import { lexemes, sentences } from "./lexicon.ts";
import { id, timestamps } from "./shared.ts";

export const userPrefs = pgTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceLang: sourceLangEnum("source_lang").notNull().default("en"),
  /**
   * The course this learner is studying. Null means the default course, so
   * a learner is never stranded by a course being retired and an existing
   * database needs no backfill. XP, streaks, hearts and leagues are the
   * learner's, not the course's, and stay global (ARCHITECTURE section 2.6).
   */
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  dailyGoalXp: integer("daily_goal_xp").notNull().default(50),
  reminderOptIn: boolean("reminder_opt_in").notNull().default(false),
  /** Off means listening exercises run in their quiet variant (read, do not hear). */
  listeningEnabled: boolean("listening_enabled").notNull().default(true),
  /** Off means speaking exercises are skipped. */
  speakingEnabled: boolean("speaking_enabled").notNull().default(true),
  /** "any" | "female" | "male" | "child" | a speaker id: which voice to play first when a word has several. */
  preferredVoice: text("preferred_voice").notNull().default("any"),
  /** When the learner finished (or skipped) the first-run onboarding; null means show it. */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  ...timestamps(),
});

/** FSRS state. Written only by `packages/scheduler`. */
export const reviewCards = pgTable(
  "review_cards",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lexemeId: uuid("lexeme_id").references(() => lexemes.id),
    sentenceId: uuid("sentence_id").references(() => sentences.id),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    lastReviewAt: timestamp("last_review_at", { withTimezone: true }),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: cardStateEnum("state").notNull().default("new"),
    ...timestamps(),
  },
  (t) => [
    unique("review_cards_user_lexeme_uq").on(t.userId, t.lexemeId),
    unique("review_cards_user_sentence_uq").on(t.userId, t.sentenceId),
    index("review_cards_due_idx").on(t.userId, t.dueAt),
    check(
      "review_cards_one_target",
      sql`(${t.lexemeId} IS NOT NULL) <> (${t.sentenceId} IS NOT NULL)`,
    ),
  ],
);

/** Append-only. This is what fsrs-rs optimises against later. */
export const reviewLog = pgTable(
  "review_log",
  {
    id: id(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => reviewCards.id, { onDelete: "cascade" }),
    rating: smallint("rating").notNull(),
    elapsedDays: real("elapsed_days").notNull(),
    scheduledDays: real("scheduled_days").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_log_card_idx").on(t.cardId, t.reviewedAt),
    check("review_log_rating_range", sql`${t.rating} BETWEEN 1 AND 4`),
  ],
);

/**
 * Words a learner got wrong in a lesson, so "practise mistakes" has
 * something to work from. One open row per (learner, lexeme, exercise
 * type); a right answer in a mistakes session sets `cleared_at`, a wrong
 * one bumps `times_wrong`. Cleared rows are kept: they are the record of
 * what was hard, and re-missing a word reopens the same row.
 */
export const learnerMistakes = pgTable(
  "learner_mistakes",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lexemeId: uuid("lexeme_id")
      .notNull()
      .references(() => lexemes.id, { onDelete: "cascade" }),
    exerciseType: exerciseTypeEnum("exercise_type").notNull(),
    timesWrong: integer("times_wrong").notNull().default(1),
    lastWrongAt: timestamp("last_wrong_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null while the mistake is open; set when the learner gets it right again. */
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("learner_mistakes_user_lexeme_type_uq").on(t.userId, t.lexemeId, t.exerciseType),
    index("learner_mistakes_open_idx").on(t.userId, t.clearedAt, t.lastWrongAt),
  ],
);

/**
 * The chest at the end of a skill on the path (docs/DESIGN.md "The path").
 * One row per learner per skill, and the unique constraint is the whole
 * mechanism: the chest grants its XP once and a replayed lesson cannot
 * farm it. A guest claims theirs on the device and it is replayed here at
 * sign-up, exactly like their lessons.
 */
export const skillChests = pgTable(
  "skill_chests",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    /** What was actually granted, so changing the constant never rewrites history. */
    xpAwarded: integer("xp_awarded").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("skill_chests_user_skill_uq").on(t.userId, t.skillId),
    index("skill_chests_user_idx").on(t.userId),
  ],
);

/** Append-only. Levels and totals are derived, never stored as a mutable counter. */
export const xpEvents = pgTable(
  "xp_events",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    refKind: text("ref_kind"),
    refId: uuid("ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("xp_events_user_idx").on(t.userId, t.createdAt)],
);

export const streaks = pgTable("streaks", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  current: integer("current").notNull().default(0),
  longest: integer("longest").notNull().default(0),
  lastActiveDate: date("last_active_date"),
  freezeCount: integer("freeze_count").notNull().default(0),
  /** ISO week (Monday) the Plus freeze was last topped up, so one freeze per week is a fact, not a timer. */
  freezeWeek: date("freeze_week"),
  /** The day a freeze covered, for "your streak was saved on Tuesday". */
  lastFrozenDate: date("last_frozen_date"),
  ...timestamps(),
});

/**
 * Expo push tokens, one row per device (docs/ARCHITECTURE.md, reminders).
 * The mobile app registers a token when the learner turns streak reminders
 * on and refreshes it on every start; sign-out removes it. `disabled_at` is
 * set when Expo answers `DeviceNotRegistered`, so the nightly job stops
 * pushing to a dead device without losing the row a reinstall re-registers.
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Unique: a device that changes hands moves to the new account instead of being pushed to twice. */
    token: text("token").notNull(),
    /** ios | android — the two platforms the app ships on. */
    platform: text("platform").notNull(),
    appVersion: text("app_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
  },
  (t) => [
    unique("push_tokens_token_uq").on(t.token),
    index("push_tokens_user_idx").on(t.userId),
    check("push_tokens_platform", sql`${t.platform} IN ('ios', 'android')`),
  ],
);
