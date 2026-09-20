CREATE TYPE "public"."notification_status" AS ENUM('sent', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('completion', 'otp');--> statement-breakpoint
CREATE TYPE "public"."template_approval_status" AS ENUM('approved', 'pending');--> statement-breakpoint
CREATE TYPE "public"."template_type" AS ENUM('completion', 'otp');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"overridden_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "manual_notification_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"confirmed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "template_type" NOT NULL,
	"body" text NOT NULL,
	"meta_template_name" text,
	"approval_status" "template_approval_status" DEFAULT 'pending' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid,
	"type" "notification_type" NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"recipient_phone" text NOT NULL,
	"rendered_content" text NOT NULL,
	"status" "notification_status" NOT NULL,
	"message_id" text,
	"pg_boss_job_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "otp_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_used" boolean DEFAULT false NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_overrides" ADD CONSTRAINT "delivery_overrides_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_overrides" ADD CONSTRAINT "delivery_overrides_overridden_by_users_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "manual_notification_confirmations" ADD CONSTRAINT "manual_notification_confirmations_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "manual_notification_confirmations" ADD CONSTRAINT "manual_notification_confirmations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_overrides_ticket_id_unique_idx" ON "delivery_overrides" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "manual_notification_confirmations_notification_id_unique_idx" ON "manual_notification_confirmations" USING btree ("notification_id");