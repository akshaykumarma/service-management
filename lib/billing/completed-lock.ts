import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * FR-015: once a ticket has ever reached "Completed," its line items are permanently
 * frozen — even across a later backward transition (003-ticket-lifecycle's own rule).
 * Read-only against status_history (research.md §1) — no new column anywhere, since
 * status_history already answers this and is append-only (the check can only ever go
 * from false to true, never back).
 */
export async function isBillLocked(ticketId: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM status_history
      WHERE ticket_id = ${ticketId} AND to_status = 'completed'
    ) AS "exists"
  `);
  return Boolean(result.rows[0]?.exists);
}
