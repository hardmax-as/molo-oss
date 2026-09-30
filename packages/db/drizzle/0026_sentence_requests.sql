CREATE TYPE "public"."sentence_request_status" AS ENUM('open', 'fulfilled', 'dismissed');--> statement-breakpoint
CREATE TABLE "sentence_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"order" integer DEFAULT 1 NOT NULL,
	"prompt_en" text NOT NULL,
	"prompt_nb" text,
	"note" text,
	"target_lexeme_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "sentence_request_status" DEFAULT 'open' NOT NULL,
	"fulfilled_sentence_id" uuid,
	"fulfilled_by" text,
	"fulfilled_at" timestamp with time zone,
	"dismissed_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sentence_requests_skill_slug_uq" UNIQUE("skill_id","slug")
);
--> statement-breakpoint
ALTER TABLE "sentence_requests" ADD CONSTRAINT "sentence_requests_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_requests" ADD CONSTRAINT "sentence_requests_fulfilled_sentence_id_sentences_id_fk" FOREIGN KEY ("fulfilled_sentence_id") REFERENCES "public"."sentences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_requests" ADD CONSTRAINT "sentence_requests_fulfilled_by_user_id_fk" FOREIGN KEY ("fulfilled_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentence_requests" ADD CONSTRAINT "sentence_requests_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sentence_requests_skill_idx" ON "sentence_requests" USING btree ("skill_id","order");--> statement-breakpoint
CREATE INDEX "sentence_requests_status_idx" ON "sentence_requests" USING btree ("status");