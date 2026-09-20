import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, tickets } from "@/lib/db/schema";
import { calculateBill } from "@/lib/billing/bill-calculation";
import { renderTemplate, getApprovedTemplateBody } from "@/lib/whatsapp/templates";
import { getBoss } from "@/lib/jobs/boss";
import { SEND_WHATSAPP_MESSAGE_QUEUE, type SendWhatsAppMessageJobData } from "@/jobs/send-whatsapp-message";

/**
 * "First reached Completed" read from the append-only status_history — the third
 * independent instance of this derived-fact pattern (004's bill lock, this one, and
 * 006's report attribution; flagged in tasks.md T054 as a future-consolidation
 * candidate, not silently re-duplicated without record). Implemented as a COUNT rather
 * than 004's EXISTS: the caller inserts this transition's own status_history row before
 * calling this function, so "first" means exactly one to_status='completed' row exists,
 * not zero.
 */
async function isFirstCompletion(ticketId: string): Promise<boolean> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count FROM status_history
    WHERE ticket_id = ${ticketId} AND to_status = 'completed'
  `);
  return Number(result.rows[0]?.count ?? 0) === 1;
}

/**
 * Called on every transition to "completed"; a no-op past the first (research.md §4 —
 * no second message on a later re-Completed transition after a backward move).
 */
export async function triggerCompletionNotification(ticketId: string): Promise<void> {
  if (!(await isFirstCompletion(ticketId))) return;

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket) return;
  const [store] = await db.select().from(stores).where(eq(stores.id, ticket.storeId)).limit(1);
  const bill = await calculateBill(ticketId);

  const templateParams = {
    customer_name: ticket.customerName,
    ticket_id: ticket.ticketNumber,
    machine_model: ticket.machineModel,
    bill_total: bill.total.toFixed(2),
    store_name: store?.name ?? "",
    store_phone: store?.phone ?? "",
  };
  // Nothing sensitive in a completion message — the stored copy is the same text sent.
  // The rendered/stored copy reflects the currently-*approved* wording (research.md §5 —
  // a pending edit never affects a real send); the actual Meta API call itself is keyed
  // by `type` against Meta's own pre-approved template, not by this body text.
  const content = renderTemplate(await getApprovedTemplateBody("completion"), templateParams);

  const boss = await getBoss();
  const jobData: SendWhatsAppMessageJobData = {
    ticketId: ticket.id,
    type: "completion",
    recipientPhone: ticket.customerPhone,
    templateParams,
    storedContent: content,
  };
  await boss.send(SEND_WHATSAPP_MESSAGE_QUEUE, jobData);
}
