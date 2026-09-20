import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * The timestamp a ticket FIRST reached "Completed" — the third independent
 * implementation of this exact derived fact, after `004`'s Completed-lock (existence
 * only) and `005`'s once-only-notification trigger (research.md §1, flagged as a
 * recommended follow-up refactor rather than silently accepted a third time, T041).
 * FR-017/FR-018 need the actual timestamp, not just existence, so this can't reuse
 * either of those two boolean-only checks even if it shared their code.
 */
export async function getFirstCompletedAt(ticketId: string): Promise<Date | null> {
  const result = await db.execute<{ first_completed_at: Date | null }>(sql`
    SELECT MIN(created_at) AS first_completed_at FROM status_history
    WHERE ticket_id = ${ticketId} AND to_status = 'completed'
  `);
  return result.rows[0]?.first_completed_at ?? null;
}
