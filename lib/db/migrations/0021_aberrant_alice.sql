CREATE TABLE IF NOT EXISTS "demo_ticket_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"demo_ticket_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "demo_ticket_invoices" ADD CONSTRAINT "demo_ticket_invoices_demo_ticket_id_demo_tickets_id_fk" FOREIGN KEY ("demo_ticket_id") REFERENCES "public"."demo_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "demo_ticket_invoices_demo_ticket_id_unique_idx" ON "demo_ticket_invoices" USING btree ("demo_ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "demo_ticket_invoices_token_unique_idx" ON "demo_ticket_invoices" USING btree ("token");