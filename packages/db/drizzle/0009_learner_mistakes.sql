CREATE TABLE "learner_mistakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"lexeme_id" uuid NOT NULL,
	"exercise_type" "exercise_type" NOT NULL,
	"times_wrong" integer DEFAULT 1 NOT NULL,
	"last_wrong_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_mistakes_user_lexeme_type_uq" UNIQUE("user_id","lexeme_id","exercise_type")
);
--> statement-breakpoint
ALTER TABLE "learner_mistakes" ADD CONSTRAINT "learner_mistakes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_mistakes" ADD CONSTRAINT "learner_mistakes_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learner_mistakes_open_idx" ON "learner_mistakes" USING btree ("user_id","cleared_at","last_wrong_at");