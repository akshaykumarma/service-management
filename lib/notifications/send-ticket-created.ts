import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, type tickets } from "@/lib/db/schema";
import { formatBusinessDate, formatDate } from "@/lib/format/date";
import { renderTemplate, getApprovedTemplateBody, NOT_GIVEN } from "@/lib/whatsapp/templates";
import { getBoss } from "@/lib/jobs/boss";
import { SEND_WHATSAPP_MESSAGE_QUEUE, type SendWhatsAppMessageJobData } from "@/jobs/send-whatsapp-message";

/**
 * Post-v1 product feedback: when a service ticket is created, the customer gets a
 * WhatsApp acknowledgement with their ticket number. Same queue, retry and
 * `notifications` record as the completion message (lib/notifications/send-completion.ts).
 */
export async function triggerTicketCreatedNotification(ticket: typeof tickets.$inferSelect): Promise<void> {
  const [store] = await db.select().from(stores).where(eq(stores.id, ticket.storeId)).limit(1);

  const templateParams = {
    customer_name: ticket.customerName,
    ticket_id: ticket.ticketNumber,
    machine_model: ticket.machineModel,
    // Everything else entered at intake (post-v1 product feedback).
    customer_phone: ticket.customerPhone,
    alt_phone: ticket.customerAltPhone || NOT_GIVEN,
    serial_number: ticket.serialNumber || NOT_GIVEN,
    issue_description: ticket.issueDescription,
    received_date: formatBusinessDate(ticket.createdAt),
    // A plain calendar date (no time), so no time-zone conversion.
    estimated_pickup_date: ticket.estimatedPickupDate ? formatDate(ticket.estimatedPickupDate) : NOT_GIVEN,
    store_name: store?.name ?? "",
    // The store's own phone; older stores without one fall back to their WhatsApp number.
    store_phone: store?.phone ?? store?.whatsappNumber ?? "",
  };
  const content = renderTemplate(await getApprovedTemplateBody("ticket_created"), templateParams);

  const boss = await getBoss();
  const jobData: SendWhatsAppMessageJobData = {
    ticketId: ticket.id,
    type: "ticket_created",
    recipientPhone: ticket.customerPhone,
    templateParams,
    storedContent: content,
  };
  await boss.send(SEND_WHATSAPP_MESSAGE_QUEUE, jobData);
}
