import { boolean, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { roleEnum } from "./enums.ts";

/**
 * Better Auth core tables. Column names follow Better Auth's defaults so the
 * Drizzle adapter maps them without renames. Ids are text because Better
 * Auth generates them.
 */
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  leaguesOptOut: boolean("leagues_opt_out").notNull().default(false),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** Eligibility is retained; birth year and birthday confirmation are discarded. */
  ageOk: boolean("age_ok").notNull().default(false),
  /**
   * True from the moment an Apple or Google sign-in creates an account without
   * an age declaration until the learner confirms birth year and country
   * (`POST /me/age`). While true, the API refuses everything but the age step,
   * sign-out, export and deletion. Older accounts stay false: not re-asked.
   */
  agePending: boolean("age_pending").notNull().default(false),
  /** Validated registration choice. Older accounts remain unknown; never inferred from IP. */
  country: text("country", { enum: ["NO", "ZA", "OTHER"] }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    /** Better Auth 1.7: the OIDC issuer for the provider (null for credentials). */
    issuer: text("issuer"),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/**
 * Roles are a separate table, not a column: a user can be both learner and
 * editor, and the write-path checks in repositories read from here.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    grantedBy: text("granted_by").references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);
