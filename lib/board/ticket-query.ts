import { and, desc, gte, ilike, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { getScopedStoreIds } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";
import type { TicketStatus } from "@/lib/tickets/status-transitions";

export interface TicketFilters {
  storeIds?: string[];
  statuses?: TicketStatus[];
  dateFrom?: string;
  dateTo?: string;
  ticketId?: string;
  customerName?: string;
  customerPhone?: string;
  machineModel?: string;
  /** 003's own pre-existing default view (exclude Cancelled unless explicitly requested);
   * overridden by an explicit `statuses` filter that itself asks for "cancelled". */
  includeCancelled?: boolean;
}

/**
 * The ONE place role/store visibility AND FR-008/FR-009's filter criteria are applied
 * together (research.md §2) — the board, the filtered list, and GET /api/tickets all
 * call this, so scoping can never drift between two independent implementations.
 */
export async function queryScopedTickets(
  caller: SessionUser,
  filters: TicketFilters = {},
): Promise<(typeof tickets.$inferSelect)[]> {
  const scope = await getScopedStoreIds(caller);
  if (scope !== "all" && scope.length === 0) return [];

  const conditions = [];

  // FR-010: a requested storeId[] is intersected with the caller's visible scope, never
  // used to escape it — an out-of-scope id is simply excluded, not an error.
  if (scope !== "all") {
    const requestedWithinScope =
      filters.storeIds && filters.storeIds.length > 0
        ? filters.storeIds.filter((id) => scope.includes(id))
        : scope;
    conditions.push(inArray(tickets.storeId, requestedWithinScope));
  } else if (filters.storeIds && filters.storeIds.length > 0) {
    conditions.push(inArray(tickets.storeId, filters.storeIds));
  }

  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(tickets.status, filters.statuses));
  } else if (!filters.includeCancelled) {
    conditions.push(ne(tickets.status, "cancelled"));
  }

  if (filters.dateFrom) {
    conditions.push(gte(tickets.createdAt, new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    // Inclusive of the entire end date, not just its midnight instant.
    const end = new Date(filters.dateTo);
    end.setUTCHours(23, 59, 59, 999);
    conditions.push(lte(tickets.createdAt, end));
  }

  // Contains matching (quickstart.md's own demonstrated behavior — "matches tickets
  // whose OWN historical name field contains 'Sharma'"), not just prefix: the
  // idx_tickets_customer_name btree index only accelerates a prefix/exact match, so a
  // leading-wildcard ILIKE here doesn't get full use of it at very large scale — noted
  // as a discrepancy between research.md's index rationale and quickstart's own example
  // rather than silently picking one, but "contains" is what the executable scenario
  // demonstrates, so that's what's implemented.
  if (filters.ticketId) {
    conditions.push(ilike(tickets.ticketNumber, `%${filters.ticketId}%`));
  }
  if (filters.customerName) {
    conditions.push(ilike(tickets.customerName, `%${filters.customerName}%`));
  }
  if (filters.customerPhone) {
    conditions.push(ilike(tickets.customerPhone, `%${filters.customerPhone}%`));
  }
  if (filters.machineModel) {
    conditions.push(ilike(tickets.machineModel, `%${filters.machineModel}%`));
  }

  return db
    .select()
    .from(tickets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tickets.createdAt));
}
