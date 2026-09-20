import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * FR-004's alert isn't a stored entity — its existence is exactly this derived query
 * (research.md §7): a failed notification with no matching confirmation yet. Surfaced
 * wherever the ticket detail view or board already polls, no new push infrastructure.
 */
export async function hasUnconfirmedFailedNotification(ticketId: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.ticket_id = ${ticketId} AND n.status = 'failed'
      AND NOT EXISTS (
        SELECT 1 FROM manual_notification_confirmations c WHERE c.notification_id = n.id
      )
    ) AS "exists"
  `);
  return Boolean(result.rows[0]?.exists);
}

/**
 * True when this ticket's most recent OTP attempt is locked (3-strikes or timeout
 * exhaustion, FR-012/FR-023) and needs an Admin/Super-Admin reinitiate — same
 * derived-query pattern as above, no separate "needs attention" table.
 */
export async function needsOtpOverride(ticketId: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM otp_verifications o
      WHERE o.ticket_id = ${ticketId} AND o.locked = true
      AND o.issued_at = (
        SELECT MAX(issued_at) FROM otp_verifications WHERE ticket_id = ${ticketId}
      )
    ) AS "exists"
  `);
  return Boolean(result.rows[0]?.exists);
}
