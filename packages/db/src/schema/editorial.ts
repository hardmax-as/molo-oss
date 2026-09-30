import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.ts";
import { exercises } from "./curriculum.ts";
import { entityKindEnum, sourceLangEnum, statusEnum } from "./enums.ts";
import { id } from "./shared.ts";

/** Assignment and priority for anything sitting in review. */
export const reviewAssignments = pgTable(
  "review_assignments",
  {
    id: id(),
    entityKind: entityKindEnum("entity_kind").notNull(),
    entityId: uuid("entity_id").notNull(),
    assignedTo: text("assigned_to").references(() => users.id),
    /** When the current assignee took it; null while unassigned. */
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    /** Who claimed or handed it over. The full trail is in `content_revisions`. */
    assignedBy: text("assigned_by").references(() => users.id),
    priority: integer("priority").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("review_assignments_entity_uq").on(t.entityKind, t.entityId),
    /**
     * The queue's "mine" and "unassigned" filters both read this column, and
     * deleting an account clears every row it holds. Migration 0011 created
     * the index but never declared it here, so a pushed database lacked it.
     */
    index("review_assignments_assigned_to_idx").on(t.assignedTo),
  ],
);

/**
 * The review queue is a view over every `in_review` row across the content
 * tables, joined to its assignment. Maintained here as SQL so a new content
 * table means one more UNION branch.
 */
export const reviewQueue = pgView("review_queue", {
  entityKind: entityKindEnum("entity_kind").notNull(),
  entityId: uuid("entity_id").notNull(),
  label: text("label").notNull(),
  status: statusEnum("status").notNull(),
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  assignedTo: text("assigned_to"),
  priority: integer("priority").notNull(),
  notes: text("notes"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  assignedBy: text("assigned_by"),
}).as(sql`
  WITH items AS (
    SELECT 'lexeme'::entity_kind AS entity_kind, id AS entity_id, lemma AS label, status, created_by, updated_at FROM lexemes WHERE status = 'in_review'
    UNION ALL
    SELECT 'gloss'::entity_kind, id, gloss, status, created_by, updated_at FROM glosses WHERE status = 'in_review'
    UNION ALL
    SELECT 'sentence'::entity_kind, id, text_xh, status, created_by, updated_at FROM sentences WHERE status = 'in_review'
    UNION ALL
    SELECT 'sentence_gloss'::entity_kind, id, gloss, status, created_by, updated_at FROM sentence_glosses WHERE status = 'in_review'
    UNION ALL
    SELECT 'audio_asset'::entity_kind, id, r2_key, status, created_by, updated_at FROM audio_assets WHERE status = 'in_review'
    UNION ALL
    SELECT 'exercise'::entity_kind, id, type::text, status, created_by, updated_at FROM exercises WHERE status = 'in_review'
    UNION ALL
    SELECT 'lesson'::entity_kind, id, id::text, status, created_by, updated_at FROM lessons WHERE status = 'in_review'
    UNION ALL
    SELECT 'skill'::entity_kind, id, slug, status, created_by, updated_at FROM skills WHERE status = 'in_review'
    UNION ALL
    SELECT 'unit'::entity_kind, id, slug, status, created_by, updated_at FROM units WHERE status = 'in_review'
  )
  SELECT i.entity_kind, i.entity_id, i.label, i.status, i.created_by, i.updated_at,
         a.assigned_to, COALESCE(a.priority, 0) AS priority, a.notes,
         a.assigned_at, a.assigned_by
  FROM items i
  LEFT JOIN review_assignments a ON a.entity_kind = i.entity_kind AND a.entity_id = i.entity_id
`);

/** Every status change and every field edit. Append-only. */
export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: id(),
    entityKind: entityKindEnum("entity_kind").notNull(),
    entityId: uuid("entity_id").notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>().notNull(),
    actorId: text("actor_id").references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_revisions_entity_idx").on(t.entityKind, t.entityId, t.createdAt)],
);

/**
 * A learner's note against one exercise, filed from the check bar. This is
 * how a wrong gloss reaches an editor instead of dying in a one-star review
 * on the store, so it is cheap to file and impossible to mistake for
 * content: nothing here is ever shown to another learner, and nothing here
 * can change a status.
 *
 * `reason` is the closed list `EXERCISE_REPORT_REASONS` in `@molo/core`,
 * held as text with a check rather than a Postgres enum so adding a reason
 * stays an ordinary migration. `user_id` goes null when the account is
 * deleted; the report survives, because the content problem it names does.
 */
export const exerciseReports = pgTable(
  "exercise_reports",
  {
    id: id(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    /** The learner's own words, capped at the API boundary. Never rendered to another learner. */
    note: text("note"),
    /** Which gloss language they were reading, so an editor knows which one to check. */
    sourceLang: sourceLangEnum("source_lang").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("exercise_reports_open_idx").on(t.resolvedAt, t.createdAt),
    index("exercise_reports_exercise_idx").on(t.exerciseId),
    check(
      "exercise_reports_reason",
      sql`${t.reason} IN ('wrong_gloss', 'wrong_answer', 'audio_problem', 'typo', 'other')`,
    ),
  ],
);

export const ingestRuns = pgTable("ingest_runs", {
  id: id(),
  adapter: text("adapter").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  rowsIn: integer("rows_in").notNull().default(0),
  rowsCreated: integer("rows_created").notNull().default(0),
  rowsSkipped: integer("rows_skipped").notNull().default(0),
  licence: text("licence").notNull(),
  notes: text("notes"),
  /** Upstream commit, file checksums, whatever pins the input. */
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
});
