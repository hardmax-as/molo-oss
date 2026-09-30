CREATE TYPE "public"."grammar_cell_role" AS ENUM('example', 'paradigm');--> statement-breakpoint
ALTER TYPE "public"."entity_kind" ADD VALUE 'grammar_note';--> statement-breakpoint
ALTER TYPE "public"."entity_kind" ADD VALUE 'grammar_note_body';--> statement-breakpoint
CREATE TABLE "grammar_note_bodies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grammar_note_id" uuid NOT NULL,
	"source_lang" "source_lang" NOT NULL,
	"title" text NOT NULL,
	"rule" text NOT NULL,
	"correction" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_note_bodies_note_lang_uq" UNIQUE("grammar_note_id","source_lang")
);
--> statement-breakpoint
CREATE TABLE "grammar_note_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grammar_note_id" uuid NOT NULL,
	"role" "grammar_cell_role" DEFAULT 'paradigm' NOT NULL,
	"order" integer NOT NULL,
	"row_label" text DEFAULT '' NOT NULL,
	"col_key" text NOT NULL,
	"surface_form" text NOT NULL,
	"morphemes" text[] DEFAULT '{}'::text[] NOT NULL,
	"lexeme_id" uuid,
	"audio_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_note_cells_note_order_uq" UNIQUE("grammar_note_id","order")
);
--> statement-breakpoint
CREATE TABLE "grammar_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"order" integer DEFAULT 1 NOT NULL,
	"row_header_key" text DEFAULT 'class' NOT NULL,
	"caveat" text,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grammar_notes_skill_slug_uq" UNIQUE("skill_id","slug")
);
--> statement-breakpoint
ALTER TABLE "grammar_note_bodies" ADD CONSTRAINT "grammar_note_bodies_grammar_note_id_grammar_notes_id_fk" FOREIGN KEY ("grammar_note_id") REFERENCES "public"."grammar_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_note_bodies" ADD CONSTRAINT "grammar_note_bodies_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_note_bodies" ADD CONSTRAINT "grammar_note_bodies_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_note_cells" ADD CONSTRAINT "grammar_note_cells_grammar_note_id_grammar_notes_id_fk" FOREIGN KEY ("grammar_note_id") REFERENCES "public"."grammar_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_note_cells" ADD CONSTRAINT "grammar_note_cells_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_note_cells" ADD CONSTRAINT "grammar_note_cells_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_notes" ADD CONSTRAINT "grammar_notes_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_notes" ADD CONSTRAINT "grammar_notes_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_notes" ADD CONSTRAINT "grammar_notes_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grammar_note_bodies_status_idx" ON "grammar_note_bodies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "grammar_note_cells_note_idx" ON "grammar_note_cells" USING btree ("grammar_note_id","order");--> statement-breakpoint
CREATE INDEX "grammar_notes_skill_idx" ON "grammar_notes" USING btree ("skill_id","order");--> statement-breakpoint
CREATE INDEX "grammar_notes_status_idx" ON "grammar_notes" USING btree ("status");
