CREATE TYPE "public"."audio_target_kind" AS ENUM('lexeme', 'sentence', 'click_drill');--> statement-breakpoint
CREATE TYPE "public"."audio_tier" AS ENUM('1_native_studio', '2_native_forvo', '3_tts');--> statement-breakpoint
CREATE TYPE "public"."card_state" AS ENUM('new', 'learning', 'review', 'relearning');--> statement-breakpoint
CREATE TYPE "public"."cefr_band" AS ENUM('A1', 'A2', 'B1');--> statement-breakpoint
CREATE TYPE "public"."consent_scope" AS ENUM('internal', 'published', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."entity_kind" AS ENUM('lexeme', 'gloss', 'sentence', 'sentence_gloss', 'audio_asset', 'exercise', 'lesson', 'skill', 'unit', 'speaker');--> statement-breakpoint
CREATE TYPE "public"."exercise_type" AS ENUM('listen_select', 'select_listen', 'translate_tap', 'translate_type', 'concord_fill', 'class_sort', 'click_drill', 'speak', 'match_pairs', 'culture_card');--> statement-breakpoint
CREATE TYPE "public"."link_kind" AS ENUM('synonym', 'antonym', 'plural_of', 'derived_from', 'see_also');--> statement-breakpoint
CREATE TYPE "public"."register" AS ENUM('standard', 'urban', 'formal', 'rural');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('learner', 'editor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."skill_kind" AS ENUM('vocab', 'grammar', 'pronunciation', 'culture');--> statement-breakpoint
CREATE TYPE "public"."source_lang" AS ENUM('en', 'nb');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'ai_draft', 'in_review', 'published', 'retired');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" text NOT NULL,
	"role" "user_role" NOT NULL,
	"granted_by" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "languages" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_source" boolean DEFAULT false NOT NULL,
	"is_target" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noun_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"prefix" text NOT NULL,
	"plural_of" uuid,
	"subject_concord" text NOT NULL,
	"object_concord" text NOT NULL,
	"adjective_concord" text,
	"possessive_concord" text NOT NULL,
	"relative_concord" text,
	"validated" boolean DEFAULT false NOT NULL,
	"notes" text,
	CONSTRAINT "noun_classes_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"gender" text,
	"region" text,
	"dialect_note" text,
	"consent_recorded_at" timestamp with time zone,
	"consent_scope" "consent_scope",
	"consent_document_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lexeme_id" uuid NOT NULL,
	"source_lang" "source_lang" NOT NULL,
	"gloss" text NOT NULL,
	"usage_note" text,
	"contrastive_note" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "glosses_lexeme_lang_uq" UNIQUE("lexeme_id","source_lang")
);
--> statement-breakpoint
CREATE TABLE "lexeme_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"kind" "link_kind" NOT NULL,
	"source_kind" text,
	CONSTRAINT "lexeme_links_uq" UNIQUE("from_id","to_id","kind")
);
--> statement-breakpoint
CREATE TABLE "lexemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lemma" text NOT NULL,
	"stem" text,
	"pos" text NOT NULL,
	"noun_class_id" uuid,
	"is_plural" boolean DEFAULT false NOT NULL,
	"infinitive" text,
	"tone_pattern" text,
	"register" "register" DEFAULT 'standard' NOT NULL,
	"cefr_band" "cefr_band",
	"frequency_rank" integer,
	"attribution" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"source" text NOT NULL,
	"source_ref" text,
	"licence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lexemes_lemma_pos_class_plural_uq" UNIQUE("lemma","pos","noun_class_id","is_plural")
);
--> statement-breakpoint
CREATE TABLE "sentence_glosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sentence_id" uuid NOT NULL,
	"source_lang" "source_lang" NOT NULL,
	"gloss" text NOT NULL,
	"literal_gloss" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentence_glosses_lang_uq" UNIQUE("sentence_id","source_lang")
);
--> statement-breakpoint
CREATE TABLE "sentence_lexemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sentence_id" uuid NOT NULL,
	"lexeme_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"surface_form" text NOT NULL,
	"morph_verified" boolean DEFAULT false NOT NULL,
	"irregular" boolean DEFAULT false NOT NULL,
	"irregular_note" text,
	CONSTRAINT "sentence_lexemes_position_uq" UNIQUE("sentence_id","position")
);
--> statement-breakpoint
CREATE TABLE "sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text_xh" text NOT NULL,
	"grammar_tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cefr_band" "cefr_band",
	"register" "register" DEFAULT 'standard' NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"source" text NOT NULL,
	"source_ref" text,
	"licence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"r2_key" text NOT NULL,
	"target_kind" "audio_target_kind" NOT NULL,
	"target_id" uuid NOT NULL,
	"speaker_id" uuid,
	"tier" "audio_tier" NOT NULL,
	"duration_ms" integer NOT NULL,
	"lufs" real NOT NULL,
	"peak_dbfs" real NOT NULL,
	"sha256" text NOT NULL,
	"codec" text NOT NULL,
	"sample_rate" integer NOT NULL,
	"licence" text NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manifest" jsonb,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"type" "exercise_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"lexeme_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"sentence_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"audio_asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"note" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_lesson_order_uq" UNIQUE("lesson_id","order")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"estimated_minutes" integer DEFAULT 5 NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lessons_skill_order_uq" UNIQUE("skill_id","order")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title_key" text NOT NULL,
	"order" integer NOT NULL,
	"kind" "skill_kind" NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skills_unit_slug_uq" UNIQUE("unit_id","slug")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title_key" text NOT NULL,
	"order" integer NOT NULL,
	"cefr_band" "cefr_band" NOT NULL,
	"prerequisite_unit_id" uuid,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "units_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "review_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"lexeme_id" uuid,
	"sentence_id" uuid,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_review_at" timestamp with time zone,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" "card_state" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_cards_user_lexeme_uq" UNIQUE("user_id","lexeme_id"),
	CONSTRAINT "review_cards_user_sentence_uq" UNIQUE("user_id","sentence_id"),
	CONSTRAINT "review_cards_one_target" CHECK (("review_cards"."lexeme_id" IS NOT NULL) <> ("review_cards"."sentence_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"elapsed_days" real NOT NULL,
	"scheduled_days" real NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_log_rating_range" CHECK ("review_log"."rating" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"longest" integer DEFAULT 0 NOT NULL,
	"last_active_date" date,
	"freeze_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"source_lang" "source_lang" DEFAULT 'en' NOT NULL,
	"daily_goal_xp" integer DEFAULT 50 NOT NULL,
	"reminder_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_kind" text,
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"diff" jsonb NOT NULL,
	"actor_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adapter" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"rows_in" integer DEFAULT 0 NOT NULL,
	"rows_created" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"licence" text NOT NULL,
	"notes" text,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_kind" "entity_kind" NOT NULL,
	"entity_id" uuid NOT NULL,
	"assigned_to" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_assignments_entity_uq" UNIQUE("entity_kind","entity_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noun_classes" ADD CONSTRAINT "noun_classes_plural_of_noun_classes_id_fk" FOREIGN KEY ("plural_of") REFERENCES "public"."noun_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glosses" ADD CONSTRAINT "glosses_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glosses" ADD CONSTRAINT "glosses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glosses" ADD CONSTRAINT "glosses_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexeme_links" ADD CONSTRAINT "lexeme_links_from_id_lexemes_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexeme_links" ADD CONSTRAINT "lexeme_links_to_id_lexemes_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexemes" ADD CONSTRAINT "lexemes_noun_class_id_noun_classes_id_fk" FOREIGN KEY ("noun_class_id") REFERENCES "public"."noun_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexemes" ADD CONSTRAINT "lexemes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lexemes" ADD CONSTRAINT "lexemes_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_glosses" ADD CONSTRAINT "sentence_glosses_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_glosses" ADD CONSTRAINT "sentence_glosses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_glosses" ADD CONSTRAINT "sentence_glosses_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_lexemes" ADD CONSTRAINT "sentence_lexemes_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_lexemes" ADD CONSTRAINT "sentence_lexemes_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_prerequisite_unit_id_units_id_fk" FOREIGN KEY ("prerequisite_unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_sentence_id_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."sentences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_card_id_review_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."review_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_assignments" ADD CONSTRAINT "review_assignments_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "glosses_search_idx" ON "glosses" USING gin (to_tsvector('simple', "gloss"));--> statement-breakpoint
CREATE INDEX "lexeme_links_to_idx" ON "lexeme_links" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "lexemes_lemma_idx" ON "lexemes" USING btree ("lemma");--> statement-breakpoint
CREATE INDEX "lexemes_status_idx" ON "lexemes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lexemes_noun_class_idx" ON "lexemes" USING btree ("noun_class_id");--> statement-breakpoint
CREATE INDEX "lexemes_frequency_rank_idx" ON "lexemes" USING btree ("frequency_rank");--> statement-breakpoint
CREATE INDEX "lexemes_lemma_search_idx" ON "lexemes" USING gin (to_tsvector('simple', "lemma"));--> statement-breakpoint
CREATE INDEX "sentence_lexemes_lexeme_idx" ON "sentence_lexemes" USING btree ("lexeme_id");--> statement-breakpoint
CREATE INDEX "sentences_status_idx" ON "sentences" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sentences_search_idx" ON "sentences" USING gin (to_tsvector('simple', "text_xh"));--> statement-breakpoint
CREATE INDEX "audio_assets_target_idx" ON "audio_assets" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "audio_assets_sha256_idx" ON "audio_assets" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "audio_assets_status_idx" ON "audio_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exercises_status_idx" ON "exercises" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exercises_lexeme_ids_idx" ON "exercises" USING gin ("lexeme_ids");--> statement-breakpoint
CREATE INDEX "units_order_idx" ON "units" USING btree ("order");--> statement-breakpoint
CREATE INDEX "review_cards_due_idx" ON "review_cards" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "review_log_card_idx" ON "review_log" USING btree ("card_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "xp_events_user_idx" ON "xp_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "content_revisions_entity_idx" ON "content_revisions" USING btree ("entity_kind","entity_id","created_at");--> statement-breakpoint
CREATE VIEW "public"."review_queue" AS (
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
         a.assigned_to, COALESCE(a.priority, 0) AS priority, a.notes
  FROM items i
  LEFT JOIN review_assignments a ON a.entity_kind = i.entity_kind AND a.entity_id = i.entity_id
);