import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoServices, demoTickets, demoTicketStatusHistory, stores } from "@/lib/db/schema";
import { resolveCustomer } from "@/lib/tickets/customer";
import { resolveReceivedAt } from "@/lib/tickets/received-date";
import { nextDemoTicketNumber } from "@/lib/demo/ticket-number";
import { generateShortCode } from "@/lib/demo/short-code";

export const DEMO_REQUIRED_FIELDS = [
  "storeId",
  "customerName",
  "customerPhone",
  "machineModel",
  "serialNumber",
  "invoiceNumber",
  "demoServiceId",
  "demoDate",
] as const;

export type CreateDemoError =
  | { code: "missing_required_field"; field: string }
  | { code: "invalid_received_date" | "received_date_in_future" | "invalid_demo_date" | "demo_date_before_received" }
  | { code: "invalid_demo_service" }
  | { code: "store_inactive" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });

/** A YYYY-MM-DD string that is a real calendar date (rejects 2026-02-31). */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Demo date can't be before the (IST) calendar day the machine was received. */
export function demoDateBeforeReceived(demoDate: string, receivedAt: Date): boolean {
  return demoDate < IST_DATE.format(receivedAt);
}

/** Active demo service + its snapshot fields, or null. */
export async function findActiveDemoService(id: unknown) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(demoServices).where(and(eq(demoServices.id, id), eq(demoServices.active, true))).limit(1);
  return row ?? null;
}

/**
 * Creates a demo ticket in New (FR-004): validates every field, back-dates like service
 * intake (lib/tickets/received-date.ts), snapshots the demo service, and writes the
 * creation status-history row — all in one transaction. Store access is the caller's
 * job (the route checks assertAccess first).
 */
export async function createDemoTicket(
  payload: Record<string, unknown>,
  actorId: string,
): Promise<{ ticket: typeof demoTickets.$inferSelect } | { error: CreateDemoError }> {
  for (const field of DEMO_REQUIRED_FIELDS) {
    const value = payload[field];
    if (typeof value !== "string" || value.trim() === "") return { error: { code: "missing_required_field", field } };
  }
  const str = (k: string) => String(payload[k]).trim();

  const received = resolveReceivedAt(payload.receivedDate);
  if (!received.ok) return { error: { code: received.error } };
  const demoDate = str("demoDate");
  if (!isValidIsoDate(demoDate)) return { error: { code: "invalid_demo_date" } };
  if (demoDateBeforeReceived(demoDate, received.receivedAt)) return { error: { code: "demo_date_before_received" } };

  const service = await findActiveDemoService(payload.demoServiceId);
  if (!service) return { error: { code: "invalid_demo_service" } };

  const [store] = await db.select({ active: stores.active }).from(stores).where(eq(stores.id, str("storeId"))).limit(1);
  if (!store?.active) return { error: { code: "store_inactive" } };

  const ticket = await db.transaction(async (tx) => {
    const customer = await resolveCustomer(tx, { name: str("customerName"), phone: str("customerPhone") });
    const ticketNumber = await nextDemoTicketNumber(tx, str("storeId"));
    const [row] = await tx
      .insert(demoTickets)
      .values({
        ticketNumber,
        storeId: str("storeId"),
        customerId: customer.id,
        customerName: str("customerName"),
        customerPhone: str("customerPhone"),
        machineModel: str("machineModel"),
        serialNumber: str("serialNumber"),
        invoiceNumber: str("invoiceNumber"),
        demoServiceId: service.id,
        demoServiceName: service.name,
        demoServicePrice: service.unitCost,
        demoDate,
        status: "new",
        shortCode: generateShortCode(),
        createdBy: actorId,
        createdAt: received.receivedAt,
        updatedAt: received.receivedAt,
      })
      .returning();
    await tx.insert(demoTicketStatusHistory).values({
      demoTicketId: row.id,
      fromStatus: null,
      toStatus: "new",
      actorId,
      createdAt: received.receivedAt,
    });
    return row;
  });

  return { ticket };
}
