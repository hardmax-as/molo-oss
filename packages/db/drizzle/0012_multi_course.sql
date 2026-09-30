-- Courses: a curriculum over a target language (ARCHITECTURE section 2.6).
--
-- Exactly one course is created here — isiXhosa — and every existing unit is
-- backfilled to it, so an existing database keeps serving exactly the
-- curriculum it served before. `units.course_id` is added nullable, filled,
-- and only then made NOT NULL, because the table is not empty in any
-- deployment that has run before.
--
-- Lexemes and sentences get `target_lang`, not `course_id`: a word is a fact
-- about a language (its class, its plural, its recording) and a course is a
-- curriculum over that language, so two courses over isiXhosa share one
-- lexicon. Their natural keys move with it: the same string can be a word in
-- two languages without being the same word.
--
-- The isiXhosa course is created `published` on purpose. Its status decides
-- whether the course is *offered*, not whether any isiXhosa has been
-- approved — every unit, lexeme, sentence and recording inside it still runs
-- its own gate untouched. Creating it as a draft would retroactively hide a
-- curriculum that is already published, which is not a migration.
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"target_lang" text NOT NULL,
	"title_key" text NOT NULL,
	"order" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "courses_order_idx" ON "courses" USING btree ("order");--> statement-breakpoint
-- At most one default course, enforced by the database rather than by a convention.
CREATE UNIQUE INDEX "courses_one_default_uq" ON "courses" USING btree ("is_default") WHERE "is_default";--> statement-breakpoint

-- `languages` is reference data the seed normally writes, but the foreign
-- keys below need `xh` to exist before any row can point at it, and a
-- freshly migrated database has no seed yet.
INSERT INTO "languages" ("code", "name", "is_source", "is_target")
VALUES ('xh', 'isiXhosa', false, true)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_target_lang_languages_code_fk" FOREIGN KEY ("target_lang") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- The one course there is.
INSERT INTO "courses" ("slug", "target_lang", "title_key", "order", "is_default", "status")
VALUES ('xhosa', 'xh', 'courses.xhosa.title', 1, true, 'published')
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

-- Lexicon: per language, not per course.
ALTER TABLE "lexemes" DROP CONSTRAINT "lexemes_lemma_pos_class_plural_uq";--> statement-breakpoint
ALTER TABLE "sentences" DROP CONSTRAINT "sentences_text_source_uq";--> statement-breakpoint
ALTER TABLE "lexemes" ADD COLUMN "target_lang" text DEFAULT 'xh' NOT NULL;--> statement-breakpoint
ALTER TABLE "sentences" ADD COLUMN "target_lang" text DEFAULT 'xh' NOT NULL;--> statement-breakpoint
ALTER TABLE "lexemes" ADD CONSTRAINT "lexemes_target_lang_languages_code_fk" FOREIGN KEY ("target_lang") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_target_lang_languages_code_fk" FOREIGN KEY ("target_lang") REFERENCES "public"."languages"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lexemes_target_lang_idx" ON "lexemes" USING btree ("target_lang");--> statement-breakpoint
CREATE INDEX "sentences_target_lang_idx" ON "sentences" USING btree ("target_lang");--> statement-breakpoint
ALTER TABLE "lexemes" ADD CONSTRAINT "lexemes_lemma_pos_class_plural_uq" UNIQUE("target_lang","lemma","pos","noun_class_id","is_plural");--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_text_source_uq" UNIQUE("target_lang","text_xh","source");--> statement-breakpoint

-- Units: nullable, backfilled to the isiXhosa course, then NOT NULL.
ALTER TABLE "units" ADD COLUMN "course_id" uuid;--> statement-breakpoint
UPDATE "units" SET "course_id" = (SELECT "id" FROM "courses" WHERE "slug" = 'xhosa') WHERE "course_id" IS NULL;--> statement-breakpoint
ALTER TABLE "units" ALTER COLUMN "course_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "units_course_idx" ON "units" USING btree ("course_id","order");--> statement-breakpoint

-- Enrolment. Null means the default course, so no learner row needs a
-- backfill and nobody is stranded if their course is ever retired.
ALTER TABLE "user_prefs" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
