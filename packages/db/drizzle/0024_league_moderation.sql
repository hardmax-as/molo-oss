CREATE TABLE "league_hides" (
	"user_id" text NOT NULL,
	"hidden_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_hides_user_id_hidden_user_id_pk" PRIMARY KEY("user_id","hidden_user_id")
);
--> statement-breakpoint
CREATE TABLE "league_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text NOT NULL,
	"reported_user_id" text NOT NULL,
	"reported_name" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_reports_pair_uq" UNIQUE("reporter_id","reported_user_id")
);
--> statement-breakpoint
ALTER TABLE "league_hides" ADD CONSTRAINT "league_hides_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_hides" ADD CONSTRAINT "league_hides_hidden_user_id_user_id_fk" FOREIGN KEY ("hidden_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_reports" ADD CONSTRAINT "league_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_reports" ADD CONSTRAINT "league_reports_reported_user_id_user_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_reports_reported_idx" ON "league_reports" USING btree ("reported_user_id","resolved_at");