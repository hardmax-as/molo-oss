CREATE TABLE "entitlements" (
	"user_id" text NOT NULL,
	"entitlement" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"source" text NOT NULL,
	"product_id" text,
	"store" text,
	"last_event_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_user_id_entitlement_pk" PRIMARY KEY("user_id","entitlement")
);
--> statement-breakpoint
CREATE TABLE "hearts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"hearts" integer DEFAULT 5 NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"practice_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hearts" ADD CONSTRAINT "hearts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;