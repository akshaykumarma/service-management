ALTER TYPE "public"."notification_type" ADD VALUE 'invoice';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_invoices" ADD CONSTRAINT "ticket_invoices_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_invoices_ticket_id_unique_idx" ON "ticket_invoices" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ticket_invoices_token_unique_idx" ON "ticket_invoices" USING btree ("token");