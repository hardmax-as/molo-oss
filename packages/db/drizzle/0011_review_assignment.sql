-- Review-queue assignment: who is holding an in_review row, since when, and
-- who handed it to them. `assigned_to` already existed; the timestamps and
-- the handing-over trail did not. The full history stays in
-- `content_revisions` — this table only carries the current state.
ALTER TABLE "review_assignments" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD COLUMN IF NOT EXISTS "assigned_by" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_assignments_assigned_to_idx" ON "review_assignments" USING btree ("assigned_to");--> statement-breakpoint
-- Rows that predate the column: treat the assignment as made when it was created.
UPDATE "review_assignments" SET "assigned_at" = "created_at" WHERE "assigned_to" IS NOT NULL AND "assigned_at" IS NULL;--> statement-breakpoint
-- The view gains the two new columns. CREATE OR REPLACE keeps the existing
-- column list and order, so the new ones are appended at the end.
CREATE OR REPLACE VIEW "public"."review_queue" AS (
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
);
