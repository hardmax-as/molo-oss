/**
 * Weekly leagues (ARCHITECTURE section 4, gamification). A league is one
 * cohort of up to `size` learners in one tier for one ISO week (Monday
 * UTC). Membership is created on the learner's first XP of the week; XP
 * itself stays in `xp_events`, standings are derived from it. At the end
 * of the week the league is finalised: ranks and outcomes are written once
 * and never changed, and the outcome decides next week's tier.
 */

import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { leagueOutcomeEnum, leagueTierEnum } from "./enums.ts";
import { id } from "./shared.ts";

export const leagues = pgTable(
  "leagues",
  {
    id: id(),
    weekStart: date("week_start").notNull(),
    tier: leagueTierEnum("tier").notNull(),
    cohort: integer("cohort").notNull().default(1),
    size: integer("size").notNull().default(20),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("leagues_week_tier_cohort_uq").on(t.weekStart, t.tier, t.cohort)],
);

export const leagueMembers = pgTable(
  "league_members",
  {
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Denormalised from the league so "one league per learner per week" is a constraint, not a convention. */
    weekStart: date("week_start").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    finalRank: integer("final_rank"),
    finalXp: integer("final_xp"),
    outcome: leagueOutcomeEnum("outcome"),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.userId] }),
    unique("league_members_user_week_uq").on(t.userId, t.weekStart),
    index("league_members_user_idx").on(t.userId, t.weekStart),
  ],
);

/**
 * A learner reporting another league member's public name (Apple guideline
 * 1.2). One report per pair; the operator is alerted and resolves it by
 * changing or clearing the name. While three or more learners have an open
 * report against someone, their name is held back from every league.
 */
export const leagueReports = pgTable(
  "league_reports",
  {
    id: id(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportedUserId: text("reported_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The name as the reporter saw it, so a later rename does not erase the evidence. */
    reportedName: text("reported_name").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("league_reports_pair_uq").on(t.reporterId, t.reportedUserId),
    index("league_reports_reported_idx").on(t.reportedUserId, t.resolvedAt),
  ],
);

/** A learner hiding another learner's name from their own league view. */
export const leagueHides = pgTable(
  "league_hides",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hiddenUserId: text("hidden_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.hiddenUserId] })],
);
