ALTER TABLE "user" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "leagues_opt_out" boolean DEFAULT false NOT NULL;