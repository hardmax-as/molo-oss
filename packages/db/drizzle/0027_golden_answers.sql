CREATE TABLE "golden_answers" (
	"case_id" text PRIMARY KEY NOT NULL,
	"form" text DEFAULT '' NOT NULL,
	"irregular" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tutor_name" text DEFAULT '' NOT NULL,
	"validated_on" text DEFAULT '' NOT NULL,
	"author_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "golden_answers" ADD CONSTRAINT "golden_answers_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "golden_answers_updated_idx" ON "golden_answers" USING btree ("updated_at");