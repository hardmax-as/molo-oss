CREATE TABLE "web_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"revenuecat_user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"consented_at" timestamp with time zone,
	"consent_version" text,
	"original_transaction_id" text,
	"purchased_at" timestamp with time zone,
	"period_starts_at" timestamp with time zone,
	"period_ends_at" timestamp with time zone,
	"store" text,
	"price" numeric(18, 6),
	"currency" text,
	"requested_at" timestamp with time zone,
	"refund_estimate" numeric(18, 6),
	"resolved_at" timestamp with time zone,
	"refund_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_purchases_original_transaction_id_unique" UNIQUE("original_transaction_id")
);
--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entitlements" ADD COLUMN "original_transaction_id" text;--> statement-breakpoint
ALTER TABLE "web_purchases" ADD CONSTRAINT "web_purchases_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_purchases_user_idx" ON "web_purchases" USING btree ("user_id");