-- "Report this exercise" from the check bar. One row per report; nothing
-- here is ever shown to another learner and nothing here changes a status.
-- The reason list is a check, not a Postgres enum, so adding a reason later
-- is an ordinary migration.
CREATE TABLE IF NOT EXISTS "exercise_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"user_id" text,
	"reason" text NOT NULL,
	"note" text,
	"source_lang" "source_lang" NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_reports_reason" CHECK ("exercise_reports"."reason" IN ('wrong_gloss', 'wrong_answer', 'audio_problem', 'typo', 'other'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "exercise_reports" ADD CONSTRAINT "exercise_reports_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "exercise_reports" ADD CONSTRAINT "exercise_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "exercise_reports" ADD CONSTRAINT "exercise_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_reports_open_idx" ON "exercise_reports" USING btree ("resolved_at","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_reports_exercise_idx" ON "exercise_reports" USING btree ("exercise_id");
