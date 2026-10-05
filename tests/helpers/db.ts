import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export async function resetDb(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE demo_ticket_status_history, demo_tickets, demo_ticket_number_counters, demo_services, audit_log, password_reset_tokens, sessions, user_stores, users,
        ticket_line_items, parts, services, machine_models,
        manual_notification_confirmations, delivery_overrides, otp_verifications, notifications, message_templates,
        ticket_photos, status_history, tickets, ticket_number_counters, customers, stores
        RESTART IDENTITY CASCADE`,
  );
}
