import { and, desc, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoTickets } from "@/lib/db/schema";
import { getScopedStoreIds } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";

export interface DemoHistoryEntry {
  id: string;
  ticketNumber: string;
  status: string;
  serialNumber: string;
  invoiceNumber: string;
  demoServiceName: string;
  demoDate: string;
  createdAt: Date;
}

export interface DemoHistoryResult {
  entries: DemoHistoryEntry[];
  /** Matching demos that weren't cancelled — what the repeat-demo warning counts. */
  activeCount: number;
  /** True when this would be at least the 3rd demo (spec.md D4). */
  warning: boolean;
}

export const REPEAT_DEMO_WARNING_THRESHOLD = 2;

const normalise = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/**
 * Earlier demo tickets for the same machine or purchase (FR-007): serial number OR
 * invoice number, case/space-insensitive, within the caller's visible stores (the same
 * scoping rule as service history), newest first.
 */
export async function lookupDemoHistory(
  caller: SessionUser,
  key: { serialNumber?: string | null; invoiceNumber?: string | null; excludeId?: string | null },
): Promise<DemoHistoryResult> {
  const serial = normalise(key.serialNumber);
  const invoice = normalise(key.invoiceNumber);
  const empty = { entries: [], activeCount: 0, warning: false };
  if (!serial && !invoice) return empty;

  const scope = await getScopedStoreIds(caller);
  if (scope !== "all" && scope.length === 0) return empty;

  const matches = [];
  if (serial) matches.push(sql`lower(trim(${demoTickets.serialNumber})) = ${serial}`);
  if (invoice) matches.push(sql`lower(trim(${demoTickets.invoiceNumber})) = ${invoice}`);

  const conditions = [or(...matches)];
  if (scope !== "all") conditions.push(inArray(demoTickets.storeId, scope));
  if (key.excludeId) conditions.push(ne(demoTickets.id, key.excludeId));

  const entries = await db
    .select({
      id: demoTickets.id,
      ticketNumber: demoTickets.ticketNumber,
      status: demoTickets.status,
      serialNumber: demoTickets.serialNumber,
      invoiceNumber: demoTickets.invoiceNumber,
      demoServiceName: demoTickets.demoServiceName,
      demoDate: demoTickets.demoDate,
      createdAt: demoTickets.createdAt,
    })
    .from(demoTickets)
    .where(and(...conditions))
    .orderBy(desc(demoTickets.createdAt));

  const activeCount = entries.filter((e) => e.status !== "cancelled").length;
  return { entries, activeCount, warning: activeCount >= REPEAT_DEMO_WARNING_THRESHOLD };
}
