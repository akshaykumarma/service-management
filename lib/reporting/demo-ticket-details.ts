import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, users } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { queryScopedDemoTickets, type DemoTicketFilters } from "@/lib/demo/query";

export interface DemoTicketDetailRow {
  id: string;
  ticketNumber: string;
  storeId: string;
  storeName: string;
  customerName: string;
  customerPhone: string;
  machineModel: string;
  serialNumber: string;
  invoiceNumber: string;
  demoServiceName: string;
  demoServicePrice: number;
  demoDate: string;
  status: string;
  createdAt: Date;
  technicianName: string | null;
}

/**
 * The Reports page's demo tickets table (post-008 product feedback: "add demo tickets to
 * reports"). Same scoping as the Demo Board (queryScopedDemoTickets — store scope, and a
 * technician's own assignments), but every status including Cancelled by default, like the
 * service report. Store/technician names come from two batched lookups, not N+1 queries.
 */
export async function getDemoTicketDetailsReport(
  caller: SessionUser,
  filters: DemoTicketFilters = {},
): Promise<DemoTicketDetailRow[]> {
  const rows = await queryScopedDemoTickets(caller, { includeCancelled: true, ...filters });
  if (rows.length === 0) return [];

  const storeIds = [...new Set(rows.map((r) => r.storeId))];
  const techIds = [...new Set(rows.map((r) => r.assignedTechnicianId).filter((id): id is string => id !== null))];
  const [storeRows, techRows] = await Promise.all([
    db.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIds)),
    techIds.length
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, techIds))
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const storeName = new Map(storeRows.map((s) => [s.id, s.name]));
  const techName = new Map(techRows.map((t) => [t.id, t.name]));

  return rows.map((t) => ({
    id: t.id,
    ticketNumber: t.ticketNumber,
    storeId: t.storeId,
    storeName: storeName.get(t.storeId) ?? t.storeId,
    customerName: t.customerName,
    customerPhone: t.customerPhone,
    machineModel: t.machineModel,
    serialNumber: t.serialNumber,
    invoiceNumber: t.invoiceNumber,
    demoServiceName: t.demoServiceName,
    demoServicePrice: Number(t.demoServicePrice),
    demoDate: t.demoDate,
    status: t.status,
    createdAt: t.createdAt,
    technicianName: t.assignedTechnicianId ? techName.get(t.assignedTechnicianId) ?? null : null,
  }));
}
