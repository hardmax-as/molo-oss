-- The chest at the end of a skill on the path (docs/DESIGN.md "The path").
-- One row per learner per skill: the unique constraint is the whole
-- anti-farming mechanism, so replaying a lesson can never grant the bonus
-- twice. `xp_awarded` records what was actually granted, so changing the
-- constant later never rewrites history.
--
-- Written by hand in the style of 0011: `drizzle-kit generate` refuses to
-- run because 0008, 0009 and 0010 all claim 0007 as their parent snapshot,
-- a collision that predates this change.
CREATE TABLE IF NOT EXISTS "skill_chests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"skill_id" uuid NOT NULL,
	"xp_awarded" integer NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_chests_user_skill_uq" UNIQUE("user_id","skill_id")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "skill_chests" ADD CONSTRAINT "skill_chests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "skill_chests" ADD CONSTRAINT "skill_chests_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_chests_user_idx" ON "skill_chests" USING btree ("user_id");
