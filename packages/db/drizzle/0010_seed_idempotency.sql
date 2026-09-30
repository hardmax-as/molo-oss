-- The dev seed re-inserted Unit 1's sentences on every run, so existing
-- databases carry copies of them. Drop the copies that are neither published
-- nor pointed at by anything, keeping one row per (text_xh, source): the one
-- something references, else the oldest. Published or referenced duplicates
-- are never deleted here -- if any remain, the constraint below fails loudly
-- and an editor decides, rather than a migration deleting content silently.
-- Cascades take the copies' sentence_glosses with them; content_revisions
-- keeps its audit rows, which have no foreign key by design.
WITH ranked AS (
  SELECT s.id,
         s.text_xh,
         s.source,
         s.created_at,
         (EXISTS (SELECT 1 FROM exercises e WHERE s.id = ANY(e.sentence_ids))
          OR EXISTS (SELECT 1 FROM sentence_lexemes sl WHERE sl.sentence_id = s.id)
          OR EXISTS (SELECT 1 FROM review_cards rc WHERE rc.sentence_id = s.id)
          OR EXISTS (SELECT 1 FROM audio_assets a WHERE a.target_kind = 'sentence' AND a.target_id = s.id)) AS is_referenced,
         (s.status = 'published') AS is_published
  FROM sentences s
), keep AS (
  SELECT DISTINCT ON (text_xh, source) id
  FROM ranked
  ORDER BY text_xh, source, is_referenced DESC, is_published DESC, created_at, id
)
DELETE FROM sentences s
USING ranked r
WHERE r.id = s.id
  AND NOT r.is_referenced
  AND NOT r.is_published
  AND NOT EXISTS (SELECT 1 FROM keep k WHERE k.id = s.id);
--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_text_source_uq" UNIQUE("text_xh","source");
