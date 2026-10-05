import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoTickets } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/auth/audit";
import { resolveCustomer } from "@/lib/tickets/customer";
import { demoDateBeforeReceived, findActiveDemoService, isValidIsoDate } from "@/lib/demo/create";

export const DEMO_EDITABLE_FIELDS = [
  "customerName",
  "customerPhone",
  "machineModel",
  "serialNumber",
  "invoiceNumber",
  "demoServiceId",
  "demoDate",
] as const;
type Field = (typeof DEMO_EDITABLE_FIELDS)[number];

export const DEMO_FIELD_LABELS: Record<string, string> = {
  customerName: "Customer name",
  customerPhone: "Phone",
  machineModel: "Model",
  serialNumber: "Serial number",
  invoiceNumber: "Invoice number",
  demoServiceName: "Demo service",
  demoDate: "Demo date",
};

const LOCKED = new Set(["completed", "cancelled"]);

export type EditDemoError =
  | { code: "ticket_locked" }
  | { code: "missing_required_field"; field: string }
  | { code: "invalid_field"; field: string }
  | { code: "invalid_demo_service" }
  | { code: "invalid_demo_date" }
  | { code: "demo_date_before_received" };

type DemoTicket = typeof demoTickets.$inferSelect;

/**
 * Edits a demo ticket's details from its page (spec.md US5) — the demo counterpart of
 * lib/tickets/edit-details.ts: only the fields sent change, everything is required,
 * Completed/Cancelled tickets are locked, the customer identity follows a name/phone
 * change, and each edit is audit-logged with before/after values.
 */
export async function editDemoTicketDetails(
  ticket: DemoTicket,
  input: Record<string, unknown>,
  actorId: string,
): Promise<{ ticket: DemoTicket } | { error: EditDemoError }> {
  if (LOCKED.has(ticket.status)) return { error: { code: "ticket_locked" } };

  const changes: Partial<Record<string, string>> = {};
  for (const [field, raw] of Object.entries(input)) {
    if (!(DEMO_EDITABLE_FIELDS as readonly string[]).includes(field)) return { error: { code: "invalid_field", field } };
    if (typeof raw !== "string" || !raw.trim()) return { error: { code: "missing_required_field", field } };
    const value = raw.trim();
    const key = field as Field;

    if (key === "demoServiceId") {
      if (value === ticket.demoServiceId) continue;
      const service = await findActiveDemoService(value);
      if (!service) return { error: { code: "invalid_demo_service" } };
      changes.demoServiceId = service.id;
      changes.demoServiceName = service.name;
      changes.demoServicePrice = service.unitCost;
      continue;
    }
    if (key === "demoDate") {
      if (!isValidIsoDate(value)) return { error: { code: "invalid_demo_date" } };
      if (demoDateBeforeReceived(value, ticket.createdAt)) return { error: { code: "demo_date_before_received" } };
    }
    if (value !== ticket[key]) changes[key] = value;
  }

  if (Object.keys(changes).length === 0) return { ticket };

  const updated = await db.transaction(async (tx) => {
    const set: Partial<typeof demoTickets.$inferInsert> = { ...changes, updatedAt: new Date() };
    if (changes.customerName !== undefined || changes.customerPhone !== undefined) {
      const customer = await resolveCustomer(tx, {
        name: changes.customerName ?? ticket.customerName,
        phone: changes.customerPhone ?? ticket.customerPhone,
      });
      set.customerId = customer.id;
    }
    const [row] = await tx.update(demoTickets).set(set).where(eq(demoTickets.id, ticket.id)).returning();

    const shown = Object.keys(changes).filter((k) => k !== "demoServiceId" && k !== "demoServicePrice");
    await writeAuditLog(tx, {
      actorId,
      entityType: "demo_ticket",
      entityId: ticket.id,
      action: "demo_ticket_details_updated",
      before: Object.fromEntries(shown.map((k) => [k, ticket[k as keyof DemoTicket] ?? null])),
      after: Object.fromEntries(shown.map((k) => [k, changes[k]])),
    });
    return row;
  });
  return { ticket: updated };
}
