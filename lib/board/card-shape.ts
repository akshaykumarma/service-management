import type { tickets } from "@/lib/db/schema";

const TERMINAL_STATUSES = new Set(["delivered", "cancelled"]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TicketCard {
  id: string;
  ticketNumber: string;
  customerName: string;
  machineModel: string;
  status: string;
  createdAt: Date;
  daysOpen: number;
}

/**
 * FR-002's days-open count freezes once a ticket reaches a terminal status (Delivered or
 * Cancelled, spec.md's own edge case) — computed live from `updated_at` at that point,
 * never stored (data-model.md).
 */
export function toTicketCard(ticket: typeof tickets.$inferSelect): TicketCard {
  const terminalAt = TERMINAL_STATUSES.has(ticket.status) ? ticket.updatedAt : new Date();
  const daysOpen = Math.floor((terminalAt.getTime() - ticket.createdAt.getTime()) / MS_PER_DAY);

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    customerName: ticket.customerName,
    machineModel: ticket.machineModel,
    status: ticket.status,
    createdAt: ticket.createdAt,
    daysOpen,
  };
}
