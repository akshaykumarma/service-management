import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { getScopedStoreIds } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";

const CLOSED_STATUSES = ["completed", "delivered"] as const;

export interface HistoryEntry {
  id: string;
  ticketNumber: string;
  status: string;
  createdAt: Date;
}

/**
 * Single indexed query (research.md §6): matches by machine model against closed
 * tickets, scoped to the caller's role/store visibility — the same scoping rule used
 * everywhere else (lib/auth/rbac.ts), not a second independent implementation of it.
 */
export async function lookupHistory(
  caller: SessionUser,
  machineModel: string,
): Promise<{ found: boolean; entries: HistoryEntry[] }> {
  const scope = await getScopedStoreIds(caller);
  if (scope !== "all" && scope.length === 0) {
    return { found: false, entries: [] };
  }

  const baseCondition = and(eq(tickets.machineModel, machineModel), inArray(tickets.status, [...CLOSED_STATUSES]));
  // Store scoping is composed into the query itself (research.md §6) rather than fetched
  // unscoped and filtered in application code — the latter was explicitly rejected there.
  const condition = scope === "all" ? baseCondition : and(baseCondition, inArray(tickets.storeId, scope));

  const rows = await db
    .select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      status: tickets.status,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .where(condition)
    .orderBy(desc(tickets.createdAt));

  return { found: rows.length > 0, entries: rows };
}
