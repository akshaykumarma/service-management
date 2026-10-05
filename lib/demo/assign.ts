import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoTickets, demoTicketStatusHistory, userStores, users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/auth/audit";
import { getBoss } from "@/lib/jobs/boss";
import { formatDate } from "@/lib/format/date";
import { shortUrlFor } from "@/lib/demo/short-code";
import { SEND_WHATSAPP_MESSAGE_QUEUE, type SendWhatsAppMessageJobData } from "@/jobs/send-whatsapp-message";

type DemoTicket = typeof demoTickets.$inferSelect;
export type WhatsAppOutcome = "queued" | "no_phone" | "not_sent";
export type AssignDemoError = "invalid_technician" | "ticket_locked";

const LOCKED = new Set(["completed", "cancelled"]);

/** The technician's message (FR-009). A fixed string, like the invoice message. */
export function demoAssignmentMessage(ticket: DemoTicket, technicianName: string): string {
  return (
    `Hi ${technicianName}, demo ticket ${ticket.ticketNumber} has been assigned to you. ` +
    `Customer: ${ticket.customerName} (${ticket.customerPhone}). Model: ${ticket.machineModel}. ` +
    `Demo date: ${formatDate(ticket.demoDate)}. Open: ${shortUrlFor(ticket.shortCode)}`
  );
}

/**
 * Sets, changes or clears a demo ticket's technician (US3). Side effects, in one
 * transaction: New → Assigned on assigning, Assigned → New on clearing (each with a
 * status-history row), and an audit row for every change. After commit, a newly
 * assigned technician gets one WhatsApp message through the existing send queue;
 * re-saving the same technician changes nothing and sends nothing.
 */
export async function assignDemoTechnician(
  ticket: DemoTicket,
  technicianId: string | null,
  actorId: string,
): Promise<{ ticket: DemoTicket; whatsapp: WhatsAppOutcome } | { error: AssignDemoError }> {
  if (LOCKED.has(ticket.status)) return { error: "ticket_locked" };

  let technician: { id: string; name: string; phone: string | null } | null = null;
  if (technicianId) {
    const [row] = await db
      .select({ id: users.id, name: users.name, phone: users.phone })
      .from(users)
      .innerJoin(userStores, eq(userStores.userId, users.id))
      .where(and(eq(users.id, technicianId), eq(users.role, "technician"), eq(users.active, true), eq(userStores.storeId, ticket.storeId)))
      .limit(1);
    if (!row) return { error: "invalid_technician" };
    technician = row;
  }

  if ((technicianId ?? null) === ticket.assignedTechnicianId) return { ticket, whatsapp: "not_sent" };

  const nextStatus =
    technicianId && ticket.status === "new" ? "assigned" : !technicianId && ticket.status === "assigned" ? "new" : ticket.status;

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(demoTickets)
      .set({ assignedTechnicianId: technicianId, status: nextStatus, updatedAt: new Date() })
      .where(eq(demoTickets.id, ticket.id))
      .returning();
    if (nextStatus !== ticket.status) {
      await tx.insert(demoTicketStatusHistory).values({
        demoTicketId: ticket.id,
        fromStatus: ticket.status,
        toStatus: nextStatus,
        actorId,
        comment: technician ? `Assigned to ${technician.name}` : "Technician removed",
      });
    }
    await writeAuditLog(tx, {
      actorId,
      entityType: "demo_ticket",
      entityId: ticket.id,
      action: "demo_ticket_assigned",
      before: { technicianId: ticket.assignedTechnicianId },
      after: { technicianId, technicianName: technician?.name ?? null },
    });
    return row;
  });

  if (!technician) return { ticket: updated, whatsapp: "not_sent" };
  if (!technician.phone) return { ticket: updated, whatsapp: "no_phone" };

  const content = demoAssignmentMessage(updated, technician.name);
  const jobData: SendWhatsAppMessageJobData = {
    ticketId: null,
    demoTicketId: updated.id,
    type: "demo_assignment",
    recipientPhone: technician.phone,
    templateParams: {
      technician_name: technician.name,
      ticket_id: updated.ticketNumber,
      customer_name: updated.customerName,
      machine_model: updated.machineModel,
      demo_date: formatDate(updated.demoDate),
      ticket_url: shortUrlFor(updated.shortCode),
    },
    storedContent: content,
  };
  const boss = await getBoss();
  await boss.send(SEND_WHATSAPP_MESSAGE_QUEUE, jobData);
  return { ticket: updated, whatsapp: "queued" };
}
