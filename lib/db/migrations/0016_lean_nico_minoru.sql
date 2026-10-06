CREATE TYPE "public"."login_outcome" AS ENUM('success', 'failed', 'locked', 'deactivated', 'logout');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"identifier" text NOT NULL,
	"outcome" "login_outcome" NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "login_events" ADD CONSTRAINT "login_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_events_created_at_idx" ON "login_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_events_user_idx" ON "login_events" USING btree ("user_id");