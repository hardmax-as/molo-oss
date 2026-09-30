import type { ExercisePayloadEncoded } from "@molo/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { cefrBandEnum, exerciseTypeEnum, skillKindEnum } from "./enums.ts";
import { languages } from "./reference.ts";
import { id, statusColumns, timestamps } from "./shared.ts";

/**
 * A course is a curriculum over a target language (ARCHITECTURE section
 * 2.6). Exactly one exists — isiXhosa — and nothing in the app creates a
 * second. `target_lang` is what ties it to the lexicon: lexemes and
 * sentences belong to a *language*, so two courses over isiXhosa would
 * share one lexicon rather than fork it.
 *
 * `status` is the same spine every content row runs; learner surfaces only
 * ever offer `published` courses.
 */
export const courses = pgTable(
  "courses",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    targetLang: text("target_lang")
      .notNull()
      .references(() => languages.code),
    titleKey: text("title_key").notNull(),
    order: integer("order").notNull().default(1),
    /** The course a learner with no explicit enrolment studies. At most one row is true. */
    isDefault: boolean("is_default").notNull().default(false),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [
    index("courses_order_idx").on(t.order),
    uniqueIndex("courses_one_default_uq")
      .on(t.isDefault)
      .where(sql`${t.isDefault}`),
  ],
);

export const units = pgTable(
  "units",
  {
    id: id(),
    /** Which curriculum this unit is part of. Backfilled to the isiXhosa course. */
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    slug: text("slug").notNull().unique(),
    titleKey: text("title_key").notNull(),
    order: integer("order").notNull(),
    cefrBand: cefrBandEnum("cefr_band").notNull(),
    prerequisiteUnitId: uuid("prerequisite_unit_id").references((): AnyPgColumn => units.id),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [index("units_order_idx").on(t.order), index("units_course_idx").on(t.courseId, t.order)],
);

export const skills = pgTable(
  "skills",
  {
    id: id(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    titleKey: text("title_key").notNull(),
    order: integer("order").notNull(),
    kind: skillKindEnum("kind").notNull(),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [unique("skills_unit_slug_uq").on(t.unitId, t.slug)],
);

export const lessons = pgTable(
  "lessons",
  {
    id: id(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull().default(5),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [unique("lessons_skill_order_uq").on(t.skillId, t.order)],
);

/**
 * `payload` is validated against the Effect Schema for `type` on every
 * write. The id arrays are denormalised from the payload so the publish
 * gate can walk the graph with one query.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: id(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    type: exerciseTypeEnum("type").notNull(),
    payload: jsonb("payload").$type<ExercisePayloadEncoded>().notNull(),
    lexemeIds: uuid("lexeme_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    sentenceIds: uuid("sentence_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    audioAssetIds: uuid("audio_asset_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** Editor notes, e.g. what is still missing before review. */
    note: text("note"),
    ...statusColumns(),
    ...timestamps(),
  },
  (t) => [
    unique("exercises_lesson_order_uq").on(t.lessonId, t.order),
    index("exercises_status_idx").on(t.status),
    index("exercises_lexeme_ids_idx").using("gin", t.lexemeIds),
  ],
);
