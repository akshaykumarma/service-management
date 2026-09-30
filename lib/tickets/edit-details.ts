import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/auth/audit";
import { resolveCustomer } from "@/lib/tickets/customer";
import { hasActiveOtpAttempt } from "@/lib/delivery/otp";

export const EDITABLE_DETAIL_FIELDS = [
  "customerName",
  "customerPhone",
  "customerAltPhone",
  "machineModel",
  "serialNumber",
  "issueDescription",
] as const;
export type EditableDetailField = (typeof EDITABLE_DETAIL_FIELDS)[number];

const REQUIRED_DETAIL_FIELDS: EditableDetailField[] = [
  "customerName",
  "customerPhone",
  "machineModel",
  "serialNumber",
  "issueDescription",
];

// Delivered/Cancelled tickets are closed records (the invoice has already gone out for a
// delivered one), so their intake details are no longer editable.
const LOCKED_STATUSES = new Set(["delivered", "cancelled"]);

export const DETAIL_FIELD_LABELS: Record<EditableDetailField, string> = {
  customerName: "Customer name",
  customerPhone: "Phone",
  customerAltPhone: "Alternate phone",
  machineModel: "Machine model",
  serialNumber: "Serial number",
  issueDescription: "Issue",
};

export type EditDetailsError =
  | { code: "ticket_locked" }
  | { code: "missing_required_field"; field: EditableDetailField }
  | { code: "invalid_field"; field: string }
  | { code: "phone_locked_during_delivery" };

type Ticket = typeof tickets.$inferSelect;

/**
 * Post-v1 product feedback: the intake details (customer name/phone, machine model,
 * serial number, issue) are editable after creation from the ticket details page. Only
 * the fields present in `input` change. The canonical customer identity follows a
 * name/phone change the same way intake does (lib/tickets/customer.ts), and every edit
 * is written to audit_log with before/after values so it appears in the ticket's
 * consolidated audit trail.
 */
export async function editTicketDetails(
  ticket: Ticket,
  input: Record<string, unknown>,
  actorId: string,
): Promise<{ ticket: Ticket } | { error: EditDetailsError }> {
  if (LOCKED_STATUSES.has(ticket.status)) return { error: { code: "ticket_locked" } };

  const changes: Partial<Record<EditableDetailField, string | null>> = {};
  for (const [field, raw] of Object.entries(input)) {
    if (!(EDITABLE_DETAIL_FIELDS as readonly string[]).includes(field)) {
      return { error: { code: "invalid_field", field } };
    }
    const key = field as EditableDetailField;
    if (raw !== null && typeof raw !== "string") return { error: { code: "invalid_field", field } };
    const value = typeof raw === "string" ? raw.trim() : null;
    if (REQUIRED_DETAIL_FIELDS.includes(key) && !value) {
      return { error: { code: "missing_required_field", field: key } };
    }
    // An emptied optional alternate phone is stored as null, like at intake.
    const next = key === "customerAltPhone" ? value || null : value;
    if (next !== (ticket[key] ?? null)) changes[key] = next;
  }

  if (Object.keys(changes).length === 0) return { ticket };

  // An OTP is out to the current number; changing it mid-attempt would strand that code.
  // The delivery section's own "correct phone & retry" flow handles that case instead.
  if (changes.customerPhone !== undefined && (await hasActiveOtpAttempt(ticket.id))) {
    return { error: { code: "phone_locked_during_delivery" } };
  }

  const updated = await db.transaction(async (tx) => {
    // Required fields were checked non-empty above; only customerAltPhone can be null.
    const set = { ...changes } as Partial<typeof tickets.$inferInsert>;
    if (changes.customerName !== undefined || changes.customerPhone !== undefined) {
      const customer = await resolveCustomer(tx, {
        name: changes.customerName ?? ticket.customerName,
        phone: changes.customerPhone ?? ticket.customerPhone,
      });
      set.customerId = customer.id;
    }

    const [row] = await tx.update(tickets).set(set).where(eq(tickets.id, ticket.id)).returning();

    const before = Object.fromEntries(Object.keys(changes).map((k) => [k, ticket[k as EditableDetailField] ?? null]));
    await writeAuditLog(tx, {
      actorId,
      entityType: "ticket",
      entityId: ticket.id,
      action: "ticket_details_updated",
      before,
      after: changes,
    });
    return row;
  });

  return { ticket: updated };
}
