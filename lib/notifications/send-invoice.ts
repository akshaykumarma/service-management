import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { getOrCreateInvoiceToken } from "@/lib/billing/invoice";
import { getBoss } from "@/lib/jobs/boss";
import { SEND_WHATSAPP_MESSAGE_QUEUE, type SendWhatsAppMessageJobData } from "@/jobs/send-whatsapp-message";

/** Same "first transition only" pattern as send-completion.ts's isFirstCompletion. */
async function isFirstDelivery(ticketId: string): Promise<boolean> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count FROM status_history
    WHERE ticket_id = ${ticketId} AND to_status = 'delivered'
  `);
  return Number(result.rows[0]?.count ?? 0) === 1;
}

/**
 * Called on every transition to "delivered" — both the OTP-verify and Admin-override
 * paths funnel through applyStatusTransition (lib/tickets/status-transitions.ts), so
 * hooking in there, same as triggerCompletionNotification, covers both. A no-op past
 * the first delivery, for the same reason completion's notification is.
 *
 * Deviation: unlike "completion" and "otp", this message's wording is a fixed string
 * here, not routed through the Super-Admin-editable/Meta-approved message_templates
 * system (lib/whatsapp/templates.ts) — the request was to generate an invoice and send
 * it via WhatsApp, not to make its wording admin-configurable, so that system is left
 * untouched rather than widened for this one caller.
 */
export async function triggerInvoiceNotification(ticketId: string): Promise<void> {
  if (!(await isFirstDelivery(ticketId))) return;

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket) return;

  const token = await getOrCreateInvoiceToken(ticketId);
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const invoiceUrl = `${baseUrl}/api/invoices/${token}`;

  const content = `Hi ${ticket.customerName}, your ${ticket.machineModel} (Ticket ${ticket.ticketNumber}) has been delivered. Download your invoice: ${invoiceUrl}`;

  const boss = await getBoss();
  const jobData: SendWhatsAppMessageJobData = {
    ticketId: ticket.id,
    type: "invoice",
    recipientPhone: ticket.customerPhone,
    templateParams: {
      customer_name: ticket.customerName,
      ticket_id: ticket.ticketNumber,
      machine_model: ticket.machineModel,
      invoice_url: invoiceUrl,
    },
    storedContent: content,
  };
  await boss.send(SEND_WHATSAPP_MESSAGE_QUEUE, jobData);
}
