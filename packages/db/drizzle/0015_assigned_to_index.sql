-- Migration 0011 created this index by hand and never declared it in the
-- Drizzle schema, so a database built by `drizzle-kit push` had it missing
-- while a migrated one had it. The schema now declares it; this brings the
-- pushed case level. `IF NOT EXISTS` because every migrated database from
-- 0011 onwards already carries it.
CREATE INDEX IF NOT EXISTS "review_assignments_assigned_to_idx" ON "review_assignments" USING btree ("assigned_to");
