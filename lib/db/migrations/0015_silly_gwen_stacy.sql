CREATE TYPE "public"."demo_ticket_status" AS ENUM('new', 'assigned', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'demo_assignment';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demo_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit_cost" numeric(12, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demo_ticket_number_counters" (
	"store_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"seq" integer NOT NULL,
	CONSTRAINT "demo_ticket_number_counters_store_id_year_pk" PRIMARY KEY("store_id","year")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demo_ticket_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demo_ticket_id" uuid NOT NULL,
	"from_status" "demo_ticket_status",
	"to_status" "demo_ticket_status" NOT NULL,
	"actor_id" uuid NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "demo_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_number" text NOT NULL,
	"store_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"machine_model" text NOT NULL,
	"serial_number" text NOT NULL,
	"invoice_number" text NOT NULL,
	"demo_service_id" uuid NOT NULL,
	"demo_service_name" text NOT NULL,
	"demo_service_price" numeric(12, 2) NOT NULL,
	"demo_date" date NOT NULL,
	"status" "demo_ticket_status" DEFAULT 'new' NOT NULL,
	"assigned_technician_id" uuid,
	"short_code" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "demo_ticket_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demo_ticket_number_counters" ADD CONSTRAINT "demo_ticket_number_counters_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demo_ticket_status_history" ADD CONSTRAINT "demo_ticket_status_history_demo_ticket_id_demo_tickets_id_fk" FOREIGN KEY ("demo_ticket_id") REFERENCES "public"."demo_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demo_ticket_status_history" ADD CONSTRAINT "demo_ticket_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_demo_service_id_demo_services_id_fk" FOREIGN KEY ("demo_service_id") REFERENCES "public"."demo_services"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_assigned_technician_id_users_id_fk" FOREIGN KEY ("assigned_technician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demo_tickets" ADD CONSTRAINT "demo_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "demo_tickets_ticket_number_unique_idx" ON "demo_tickets" USING btree ("ticket_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "demo_tickets_short_code_unique_idx" ON "demo_tickets" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demo_tickets_store_idx" ON "demo_tickets" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demo_tickets_serial_idx" ON "demo_tickets" USING btree (lower(trim("serial_number")));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demo_tickets_invoice_idx" ON "demo_tickets" USING btree (lower(trim("invoice_number")));--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_demo_ticket_id_demo_tickets_id_fk" FOREIGN KEY ("demo_ticket_id") REFERENCES "public"."demo_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
