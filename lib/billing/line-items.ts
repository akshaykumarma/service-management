import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets, parts, services, ticketLineItems } from "@/lib/db/schema";
import { isBillLocked } from "@/lib/billing/completed-lock";
import { calculateBill, type Bill } from "@/lib/billing/bill-calculation";
import { isValidTaxRate } from "@/lib/admin/stores";

export type LineItemError =
  | "invalid_quantity"
  | "invalid_unit_cost"
  | "invalid_tax_rate"
  | "item_inactive"
  | "ticket_status_invalid"
  | "bill_locked"
  | "not_found";

const EDITABLE_STATUSES = ["in_progress", "on_hold"] as const;

async function checkTicketWritable(ticketId: string): Promise<{ ticket: typeof tickets.$inferSelect } | { error: LineItemError }> {
  const rows = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  const ticket = rows[0];
  if (!ticket) return { error: "not_found" };

  if (await isBillLocked(ticketId)) return { error: "bill_locked" };
  if (!EDITABLE_STATUSES.includes(ticket.status as (typeof EDITABLE_STATUSES)[number])) {
    return { error: "ticket_status_invalid" };
  }

  return { ticket };
}

export async function addLineItem(
  ticketId: string,
  input: { itemType: "part" | "service"; itemId: string; quantity: number },
): Promise<{ error: LineItemError } | { lineItem: typeof ticketLineItems.$inferSelect; bill: Bill }> {
  const writable = await checkTicketWritable(ticketId);
  if ("error" in writable) return writable;

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return { error: "invalid_quantity" };
  }

  const catalogueTable = input.itemType === "part" ? parts : services;
  const catalogueRows = await db.select().from(catalogueTable).where(eq(catalogueTable.id, input.itemId)).limit(1);
  const catalogueItem = catalogueRows[0];
  if (!catalogueItem || !catalogueItem.active) {
    return { error: "item_inactive" };
  }

  const unitCost = Number(catalogueItem.unitCost);
  const lineTotal = (unitCost * input.quantity).toFixed(2);

  const [lineItem] = await db
    .insert(ticketLineItems)
    .values({
      ticketId,
      itemType: input.itemType,
      itemId: input.itemId,
      nameSnapshot: catalogueItem.name,
      quantity: input.quantity,
      unitCostSnapshot: catalogueItem.unitCost,
      lineTotal,
    })
    .returning();

  const bill = await calculateBill(ticketId);
  return { lineItem, bill };
}

/**
 * `quantity` and/or `unitCost` — at least one. `unitCost` lets the Service Manager
 * override the catalogue-snapshotted price directly on this ticket (post-004 product
 * feedback); it never re-reads or changes the catalogue item itself, so
 * price-snapshot.test.ts's guarantee (a later catalogue price change doesn't retroactively
 * affect an existing ticket) still holds — this is an explicit, per-ticket override, not a
 * re-sync.
 */
export async function updateLineItem(
  ticketId: string,
  lineItemId: string,
  input: { quantity?: number; unitCost?: number },
): Promise<{ error: LineItemError } | { lineItem: typeof ticketLineItems.$inferSelect; bill: Bill }> {
  const writable = await checkTicketWritable(ticketId);
  if ("error" in writable) return writable;

  if (input.quantity !== undefined && (!Number.isInteger(input.quantity) || input.quantity <= 0)) {
    return { error: "invalid_quantity" };
  }
  if (input.unitCost !== undefined && !(Number.isFinite(input.unitCost) && input.unitCost >= 0)) {
    return { error: "invalid_unit_cost" };
  }

  const existingRows = await db
    .select()
    .from(ticketLineItems)
    .where(eq(ticketLineItems.id, lineItemId))
    .limit(1);
  const existing = existingRows[0];
  if (!existing || existing.ticketId !== ticketId) return { error: "not_found" };

  const quantity = input.quantity ?? existing.quantity;
  const unitCost = input.unitCost ?? Number(existing.unitCostSnapshot);
  const lineTotal = (unitCost * quantity).toFixed(2);

  const [lineItem] = await db
    .update(ticketLineItems)
    .set({ quantity, unitCostSnapshot: unitCost.toFixed(2), lineTotal })
    .where(eq(ticketLineItems.id, lineItemId))
    .returning();

  const bill = await calculateBill(ticketId);
  return { lineItem, bill };
}

export async function updateTicketTaxRate(
  ticketId: string,
  taxRate: number,
): Promise<{ error: LineItemError } | { taxRate: number; bill: Bill }> {
  const writable = await checkTicketWritable(ticketId);
  if ("error" in writable) return writable;

  if (!isValidTaxRate(taxRate)) {
    return { error: "invalid_tax_rate" };
  }

  await db.update(tickets).set({ taxRate: taxRate.toFixed(2) }).where(eq(tickets.id, ticketId));

  const bill = await calculateBill(ticketId);
  return { taxRate, bill };
}

export async function removeLineItem(
  ticketId: string,
  lineItemId: string,
): Promise<{ error: LineItemError } | { bill: Bill }> {
  const writable = await checkTicketWritable(ticketId);
  if ("error" in writable) return writable;

  const existingRows = await db
    .select()
    .from(ticketLineItems)
    .where(eq(ticketLineItems.id, lineItemId))
    .limit(1);
  const existing = existingRows[0];
  if (!existing || existing.ticketId !== ticketId) return { error: "not_found" };

  await db.delete(ticketLineItems).where(eq(ticketLineItems.id, lineItemId));

  const bill = await calculateBill(ticketId);
  return { bill };
}
