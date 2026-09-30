import { boolean, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";

import { consentScopeEnum, ageGroupEnum } from "./enums.ts";
import { id, timestamps } from "./shared.ts";

export const languages = pgTable("languages", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  isSource: boolean("is_source").notNull().default(false),
  isTarget: boolean("is_target").notNull().default(false),
});

/**
 * Seeded from `crates/xh-morph/rules/noun_classes.toml` so the database and
 * the generator can never disagree. `validated` mirrors the rule table.
 */
export const nounClasses = pgTable("noun_classes", {
  id: id(),
  label: text("label").notNull().unique(),
  prefix: text("prefix").notNull(),
  pluralOf: uuid("plural_of").references((): AnyPgColumn => nounClasses.id),
  subjectConcord: text("subject_concord").notNull(),
  objectConcord: text("object_concord").notNull(),
  adjectiveConcord: text("adjective_concord"),
  possessiveConcord: text("possessive_concord").notNull(),
  relativeConcord: text("relative_concord"),
  validated: boolean("validated").notNull().default(false),
  notes: text("notes"),
});

/** No audio row references a speaker without recorded consent (checked in the repository). */
export const speakers = pgTable("speakers", {
  id: id(),
  displayName: text("display_name").notNull(),
  gender: text("gender"),
  /** child | teen | adult | elder; null until an editor sets it. */
  ageGroup: ageGroupEnum("age_group"),
  region: text("region"),
  dialectNote: text("dialect_note"),
  consentRecordedAt: timestamp("consent_recorded_at", { withTimezone: true }),
  consentScope: consentScopeEnum("consent_scope"),
  /** R2 key of the signed consent document. */
  consentDocumentKey: text("consent_document_key"),
  ...timestamps(),
});
