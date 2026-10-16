import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, type demoTickets } from "@/lib/db/schema";
import { formatDate } from "@/lib/format/date";
import { renderTemplate, getApprovedTemplateBody } from "@/lib/whatsapp/templates";
import { getBoss } from "@/lib/jobs/boss";
import { SEND_WHATSAPP_MESSAGE_QUEUE, type SendWhatsAppMessageJobData } from "@/jobs/send-whatsapp-message";

type DemoTicket = typeof demoTickets.$inferSelect;

/**
 * Demo tickets' WhatsApp messages to the customer (post-008 product feedback, the demo
 * counterpart of the service ticket's ticket-created and ready-for-pickup messages): one
 * when the demo is booked, one the first time it is completed.
 */
async function enqueueDemoCustomerMessage(ticket: DemoTicket, type: "demo_created" | "demo_completed"): Promise<void> {
  const [store] = await db.select().from(stores).where(eq(stores.id, ticket.storeId)).limit(1);
  const templateParams = {
    customer_name: ticket.customerName,
    ticket_id: ticket.ticketNumber,
    machine_model: ticket.machineModel,
    demo_service: ticket.demoServiceName,
    demo_date: formatDate(ticket.demoDate),
    demo_amount: Number(ticket.demoServicePrice).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    store_name: store?.name ?? "",
    store_phone: store?.phone ?? store?.whatsappNumber ?? "",
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
  await enqueueDemoCustomerMessage(ticket, "demo_completed");
}
