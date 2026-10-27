import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deliveryOverrides, notifications, tickets } from "@/lib/db/schema";
import { issueOtp } from "@/lib/delivery/otp";
import { enqueueOtpSend } from "@/lib/delivery/send-otp-message";
import { applyStatusTransition } from "@/lib/tickets/status-transitions";

async function latestOtpNotification(ticketId: string) {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.ticketId, ticketId), eq(notifications.type, "otp")))
    .orderBy(desc(notifications.sentAt))
    .limit(1);
  return rows[0];
}

/** FR-020's gate for POST .../correct-phone: the most recent OTP send actually failed. */
export async function hasFailedOtpSend(ticketId: string): Promise<boolean> {
  const latest = await latestOtpNotification(ticketId);
  return latest?.status === "failed";
}

/**
 * FR-021's gate: reachable only once a phone *correction's own retry* has also failed —
 * derived from two or more distinct recipient phones each having a failed OTP send for
 * this ticket, since correct-phone is the only way `tickets.customer_phone` ever
 * changes; no new "correction attempted" column needed.
 */
export async function correctionRetryHasFailed(ticketId: string): Promise<boolean> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(DISTINCT recipient_phone) AS count
    FROM notifications
    WHERE ticket_id = ${ticketId} AND type = 'otp' AND status = 'failed'
  `);
  return Number(result.rows[0]?.count ?? 0) >= 2;
}

/** research.md §3: updates only this ticket's own snapshot, never 003's shared `customers.phone`. */
export async function correctPhoneAndRetry(
  ticket: { id: string; ticketNumber: string },
  correctedPhone: string,
): Promise<void> {
  await db.update(tickets).set({ customerPhone: correctedPhone, updatedAt: new Date() }).where(eq(tickets.id, ticket.id));
  const { code } = await issueOtp(ticket.id);
  await enqueueOtpSend({ id: ticket.id, ticketNumber: ticket.ticketNumber, customerPhone: correctedPhone }, code);
}

export async function overrideToDelivered(
  ticket: Parameters<typeof applyStatusTransition>[0]["ticket"],
  reason: string,
  overriddenBy: string,
) {
  const [overrideRow] = await db.insert(deliveryOverrides).values({ ticketId: ticket.id, reason, overriddenBy }).returning();
  const { updatedTicket } = await applyStatusTransition({ ticket, toStatus: "delivered", comment: null, actorId: overriddenBy });
  return { updatedTicket, overrideRow };
}
