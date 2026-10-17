import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { SEND_WHATSAPP_MESSAGE_QUEUE } from "@/jobs/send-whatsapp-message";

/**
 * TEMPORARY (owner's request — remove before production with the rest of the WhatsApp
 * message log, see CLAUDE.md): WhatsApp messages that were queued but have no
 * `notifications` record yet, read straight from the pg-boss queue. A message only gets
 * its record once the background worker has tried to send it, so without this a message
 * would be invisible while waiting, while being sent, or if the worker couldn't record it
 * at all (e.g. the database is missing a migration). Shows the same redacted text that
 * would be stored (`storedContent` — an OTP's code is never in it).
 */
export interface UnrecordedMessage {
  id: string;
  at: Date;
  type: string;
  recipientPhone: string;
  content: string;
  /** "waiting to send", "sending" or "could not be sent or recorded". */
  state: string;
  ticketId: string | null;
  demoTicketId: string | null;
}

const STATE_LABELS: Record<string, string> = {
  created: "waiting to send",
  retry: "waiting to send",
  active: "sending",
  failed: "could not be sent or recorded",
};

export async function listUnrecordedMessages(
  filter: { ticketId?: string; demoTicketId?: string; limit?: number } = {},
): Promise<UnrecordedMessage[]> {
  const conditions = [sql`name = ${SEND_WHATSAPP_MESSAGE_QUEUE}`, sql`state IN ('created', 'retry', 'active', 'failed')`];
  if (filter.ticketId) conditions.push(sql`data->>'ticketId' = ${filter.ticketId}`);
  if (filter.demoTicketId) conditions.push(sql`data->>'demoTicketId' = ${filter.demoTicketId}`);
  try {
    const result = await db.execute<{
      id: string;
      created_on: Date;
      state: string;
      data: {
        type?: string;
        recipientPhone?: string;
        storedContent?: string;
        ticketId?: string | null;
        demoTicketId?: string | null;
      } | null;
    }>(sql`
      SELECT id, created_on, state, data FROM pgboss.job
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY created_on DESC
      LIMIT ${filter.limit ?? 200}
    `);
    return result.rows.map((row) => ({
      id: row.id,
      at: new Date(row.created_on),
      type: row.data?.type ?? "message",
      recipientPhone: row.data?.recipientPhone ?? "",
      content: row.data?.storedContent ?? "",
      state: STATE_LABELS[row.state] ?? row.state,
      ticketId: row.data?.ticketId ?? null,
      demoTicketId: row.data?.demoTicketId ?? null,
    }));
  } catch {
    // The queue's tables don't exist until the worker has started once; nothing to show.
    return [];
  }
}
