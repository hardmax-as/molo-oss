CREATE TYPE "public"."league_outcome" AS ENUM('promoted', 'stayed', 'demoted');--> statement-breakpoint
CREATE TYPE "public"."league_tier" AS ENUM('bronze', 'silver', 'gold', 'sapphire', 'ruby');--> statement-breakpoint
CREATE TABLE "league_members" (
	"league_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"final_rank" integer,
	"final_xp" integer,
	"outcome" "league_outcome",
	CONSTRAINT "league_members_league_id_user_id_pk" PRIMARY KEY("league_id","user_id"),
	CONSTRAINT "league_members_user_week_uq" UNIQUE("user_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"tier" "league_tier" NOT NULL,
	"cohort" integer DEFAULT 1 NOT NULL,
	"size" integer DEFAULT 20 NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_week_tier_cohort_uq" UNIQUE("week_start","tier","cohort")
);
--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_members_user_idx" ON "league_members" USING btree ("user_id","week_start");