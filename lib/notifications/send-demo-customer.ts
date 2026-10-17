import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, users, type demoTickets } from "@/lib/db/schema";
import { formatBusinessDate, formatDate } from "@/lib/format/date";
import { getOrCreateDemoInvoiceToken, invoiceUrlFor } from "@/lib/billing/invoice";
import { renderTemplate, getApprovedTemplateBody, NOT_GIVEN } from "@/lib/whatsapp/templates";
import { getBoss } from "@/lib/jobs/boss";
import { SEND_WHATSAPP_MESSAGE_QUEUE, type SendWhatsAppMessageJobData } from "@/jobs/send-whatsapp-message";

type DemoTicket = typeof demoTickets.$inferSelect;

/**
 * Demo tickets' WhatsApp messages to the customer (post-008 product feedback, the demo
 * counterpart of the service ticket's ticket-created and ready-for-pickup messages): one
 * when the demo is booked, with everything entered on the ticket; one the first time it
 * is completed, with who gave the demo and a link to the demo's invoice.
 */
async function enqueueDemoCustomerMessage(
  ticket: DemoTicket,
  type: "demo_created" | "demo_completed",
  extra: Record<string, string> = {},
): Promise<void> {
  const [store] = await db.select().from(stores).where(eq(stores.id, ticket.storeId)).limit(1);
  const templateParams = {
    customer_name: ticket.customerName,
    customer_phone: ticket.customerPhone,
    ticket_id: ticket.ticketNumber,
    machine_model: ticket.machineModel,
    serial_number: ticket.serialNumber,
    invoice_number: ticket.invoiceNumber,
    received_date: formatBusinessDate(ticket.createdAt),
    demo_service: ticket.demoServiceName,
    demo_date: formatDate(ticket.demoDate),
    demo_amount: Number(ticket.demoServicePrice).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    store_name: store?.name ?? "",
    store_phone: store?.phone ?? store?.whatsappNumber ?? "",
    ...extra,
  };
  const content = renderTemplate(await getApprovedTemplateBody(type), templateParams);

  const jobData: SendWhatsAppMessageJobData = {
    ticketId: null,
    demoTicketId: ticket.id,
    type,
    recipientPhone: ticket.customerPhone,
    templateParams,
    storedContent: content,
  };
  const boss = await getBoss();
  await boss.send(SEND_WHATSAPP_MESSAGE_QUEUE, jobData);
}

export async function triggerDemoCreatedNotification(ticket: DemoTicket): Promise<void> {
  await enqueueDemoCustomerMessage(ticket, "demo_created");
}

/**
 * Called after every move to Completed; sends only on the first (a demo moved back and
 * completed again doesn't message the customer twice), like the service completion message.
 */
export async function triggerDemoCompletedNotification(ticket: DemoTicket): Promise<void> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count FROM demo_ticket_status_history
    WHERE demo_ticket_id = ${ticket.id} AND to_status = 'completed'
  `);
  if (Number(result.rows[0]?.count ?? 0) !== 1) return;

  const [technician] = ticket.assignedTechnicianId
    ? await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, ticket.assignedTechnicianId)).limit(1)
    : [];
  const invoiceUrl = invoiceUrlFor(await getOrCreateDemoInvoiceToken(ticket.id));
  await enqueueDemoCustomerMessage(ticket, "demo_completed", {
    technician_name: technician?.name ?? NOT_GIVEN,
    technician_phone: technician?.phone || NOT_GIVEN,
    invoice_url: invoiceUrl,
  });
}
