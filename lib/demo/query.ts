import { and, desc, eq, gte, ilike, inArray, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoTickets, demoTicketStatusHistory, stores, users } from "@/lib/db/schema";
import { getScopedStoreIds } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";
import type { TicketFilters } from "@/lib/board/ticket-query";
import { isCurrentBusinessMonth } from "@/lib/format/business-time";
import type { DemoStatus } from "@/lib/demo/status-transitions";

const TERMINAL = new Set(["completed", "cancelled"]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DemoTicketFilters = Omit<TicketFilters, "statuses"> & { statuses?: DemoStatus[] };

/**
 * The Demo Board's scoped query — the same role/store visibility and filter set as
 * lib/board/ticket-query.ts's queryScopedTickets, over demo_tickets (FR-006).
 */
export async function queryScopedDemoTickets(caller: SessionUser, filters: DemoTicketFilters = {}) {
  const scope = await getScopedStoreIds(caller);
  if (scope !== "all" && scope.length === 0) return [];

  const conditions = [];
  if (scope !== "all") {
    const requested = filters.storeIds?.length ? filters.storeIds.filter((id) => scope.includes(id)) : scope;
    conditions.push(inArray(demoTickets.storeId, requested));
  } else if (filters.storeIds?.length) {
    conditions.push(inArray(demoTickets.storeId, filters.storeIds));
  }
  if (caller.role === "technician") conditions.push(eq(demoTickets.assignedTechnicianId, caller.id));

  if (filters.statuses?.length) conditions.push(inArray(demoTickets.status, filters.statuses));
  else if (!filters.includeCancelled) conditions.push(ne(demoTickets.status, "cancelled"));

  if (filters.dateFrom) conditions.push(gte(demoTickets.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setUTCHours(23, 59, 59, 999);
    conditions.push(lte(demoTickets.createdAt, end));
  }
  if (filters.ticketId) conditions.push(ilike(demoTickets.ticketNumber, `%${filters.ticketId}%`));
  if (filters.customerName) conditions.push(ilike(demoTickets.customerName, `%${filters.customerName}%`));
  if (filters.customerPhone) conditions.push(ilike(demoTickets.customerPhone, `%${filters.customerPhone}%`));
  if (filters.machineModel) conditions.push(ilike(demoTickets.machineModel, `%${filters.machineModel}%`));
  if (filters.technicianId) conditions.push(eq(demoTickets.assignedTechnicianId, filters.technicianId));

  return db
    .select()
    .from(demoTickets)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(demoTickets.createdAt));
}

/**
 * Board cards for GET /api/demo-tickets, with the Service Board's "only this month's
 * finished tickets" rule applied to Completed (spec.md D7): dated by the latest
 * status-history row into completed.
 */
export async function demoBoardCards(rows: (typeof demoTickets.$inferSelect)[]) {
  const completedIds = rows.filter((t) => t.status === "completed").map((t) => t.id);
  const completedRows = completedIds.length
    ? await db
        .select({ id: demoTicketStatusHistory.demoTicketId, at: demoTicketStatusHistory.createdAt })
        .from(demoTicketStatusHistory)
        .where(and(inArray(demoTicketStatusHistory.demoTicketId, completedIds), eq(demoTicketStatusHistory.toStatus, "completed")))
    : [];
  const completedAt = new Map<string, Date>();
  for (const r of completedRows) {
    const prev = completedAt.get(r.id);
    if (!prev || r.at > prev) completedAt.set(r.id, r.at);
  }
  const visible = rows.filter((t) => t.status !== "completed" || isCurrentBusinessMonth(completedAt.get(t.id) ?? t.updatedAt));

  const storeIds = [...new Set(visible.map((t) => t.storeId))];
  const techIds = [...new Set(visible.map((t) => t.assignedTechnicianId).filter((id): id is string => !!id))];
  const [storeRows, techRows] = await Promise.all([
    storeIds.length ? db.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIds)) : [],
    techIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, techIds)) : [],
  ]);
  const storeName = new Map(storeRows.map((s) => [s.id, s.name]));
  const techName = new Map(techRows.map((t) => [t.id, t.name]));

  return visible.map((t) => {
    const end = TERMINAL.has(t.status) ? t.updatedAt : new Date();
    return {
      id: t.id,
      ticketNumber: t.ticketNumber,
      customerName: t.customerName,
      machineModel: t.machineModel,
      status: t.status,
      createdAt: t.createdAt,
      daysOpen: Math.max(0, Math.floor((end.getTime() - t.createdAt.getTime()) / MS_PER_DAY)),
      demoDate: t.demoDate,
      storeId: t.storeId,
      storeName: storeName.get(t.storeId) ?? t.storeId,
      technicianName: t.assignedTechnicianId ? techName.get(t.assignedTechnicianId) ?? null : null,
    };
  });
}
