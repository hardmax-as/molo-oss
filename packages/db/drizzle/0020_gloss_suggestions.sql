CREATE TABLE "gloss_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lexeme_id" uuid NOT NULL,
	"source_lang" "source_lang" NOT NULL,
	"provenance" text NOT NULL,
	"gloss" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gloss_suggestions_lexeme_lang_provenance_uq" UNIQUE("lexeme_id","source_lang","provenance")
);
--> statement-breakpoint
ALTER TABLE "gloss_suggestions" ADD CONSTRAINT "gloss_suggestions_lexeme_id_lexemes_id_fk" FOREIGN KEY ("lexeme_id") REFERENCES "public"."lexemes"("id") ON DELETE cascade ON UPDATE no action;