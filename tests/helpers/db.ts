import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

const DEADLOCK = "40P01";

/**
 * Empties every app table between tests. WhatsApp messages still queued by the previous
 * test are dropped first: they belong to tickets about to be wiped, and sending them later
 * would only fail (and, mid-TRUNCATE, can deadlock with it). A deadlock against a send
 * already in flight is retried.
 */
export async function resetDb(): Promise<void> {
  await db.execute(
    // Every message job except one mid-send (finished ones too: failed jobs are listed as
    // "could not be sent" in the WhatsApp message log).
    sql`DELETE FROM pgboss.job WHERE name = 'send-whatsapp-message' AND state <> 'active'`,
  );
  for (let attempt = 1; ; attempt++) {
    try {
      await truncateAll();
      return;
    } catch (err) {
      const code = (err as { code?: string; cause?: { code?: string } }).code ?? (err as { cause?: { code?: string } }).cause?.code;
      if (code !== DEADLOCK || attempt >= 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

async function truncateAll(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE login_events, demo_ticket_invoices, demo_ticket_status_history, demo_tickets, demo_ticket_number_counters, demo_services, audit_log, password_reset_tokens, sessions, user_stores, users,
        ticket_line_items, parts, services, machine_models,
        manual_notification_confirmations, delivery_overrides, otp_verifications, notifications, message_templates,
        ticket_photos, status_history, tickets, ticket_number_counters, customers, stores
        RESTART IDENTITY CASCADE`,
  );
}
