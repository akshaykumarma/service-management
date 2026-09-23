import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, ticketLineItems, users } from "@/lib/db/schema";
import { queryScopedTickets, type TicketFilters } from "@/lib/board/ticket-query";
import type { SessionUser } from "@/lib/auth/session";

export interface TicketDetailRow {
  id: string;
  ticketNumber: string;
  storeId: string;
  storeName: string;
  customerName: string;
  customerPhone: string;
  machineModel: string;
  issueDescription: string;
  status: string;
  createdAt: Date;
  estimatedPickupDate: string | null;
  technicianName: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
}

/**
 * Every ticket's full detail across every status for a date range, for the Reports
 * page's table view (post-006 product feedback). Reuses queryScopedTickets for
 * role/store scope and the same filter set the board already offers, but defaults
 * includeCancelled to true — a report needs the whole picture across every status,
 * unlike the board's default working view. Bill totals are computed here from a single
 * batched line-items query (not calculateBill() per ticket) to avoid N+1 queries across
 * a report that can span many tickets.
 */
export async function getTicketDetailsReport(
  caller: SessionUser,
  filters: TicketFilters = {},
): Promise<TicketDetailRow[]> {
  const rows = await queryScopedTickets(caller, { includeCancelled: true, ...filters });
  if (rows.length === 0) return [];

  const ticketIds = rows.map((r) => r.id);
  const storeIds = [...new Set(rows.map((r) => r.storeId))];
  const technicianIds = [...new Set(rows.map((r) => r.assignedTechnicianId).filter((id): id is string => id !== null))];

  const [lineItemRows, storeRows, technicianRows] = await Promise.all([
    db
      .select({ ticketId: ticketLineItems.ticketId, lineTotal: ticketLineItems.lineTotal })
      .from(ticketLineItems)
      .where(inArray(ticketLineItems.ticketId, ticketIds)),
    db.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIds)),
    technicianIds.length > 0
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, technicianIds))
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const subtotalByTicket = new Map<string, number>();
  for (const li of lineItemRows) {
    subtotalByTicket.set(li.ticketId, (subtotalByTicket.get(li.ticketId) ?? 0) + Number(li.lineTotal));
  }
  const storeNameById = new Map(storeRows.map((s) => [s.id, s.name]));
  const technicianNameById = new Map(technicianRows.map((t) => [t.id, t.name]));

  return rows.map((ticket) => {
    const subtotal = Number((subtotalByTicket.get(ticket.id) ?? 0).toFixed(2));
    const taxAmount = Number(((subtotal * Number(ticket.taxRate)) / 100).toFixed(2));
    const total = Number((subtotal + taxAmount).toFixed(2));

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      storeId: ticket.storeId,
      storeName: storeNameById.get(ticket.storeId) ?? ticket.storeId,
      customerName: ticket.customerName,
      customerPhone: ticket.customerPhone,
      machineModel: ticket.machineModel,
      issueDescription: ticket.issueDescription,
      status: ticket.status,
      createdAt: ticket.createdAt,
      estimatedPickupDate: ticket.estimatedPickupDate,
      technicianName: ticket.assignedTechnicianId ? technicianNameById.get(ticket.assignedTechnicianId) ?? null : null,
      subtotal,
      taxAmount,
      total,
    };
  });
}
