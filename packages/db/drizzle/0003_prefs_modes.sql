ALTER TABLE "user_prefs" ADD COLUMN "listening_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "speaking_enabled" boolean DEFAULT true NOT NULL;