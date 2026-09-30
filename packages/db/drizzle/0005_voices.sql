CREATE TYPE "public"."age_group" AS ENUM('child', 'teen', 'adult', 'elder');--> statement-breakpoint
ALTER TABLE "speakers" ADD COLUMN "age_group" "age_group";--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "preferred_voice" text DEFAULT 'any' NOT NULL;