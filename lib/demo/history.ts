import { and, desc, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoTickets } from "@/lib/db/schema";
import { getScopedStoreIds } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";

export interface DemoHistoryEntry {
  id: string;
  ticketNumber: string;
  status: string;
  machineModel: string;
  serialNumber: string;
  invoiceNumber: string;
  demoServiceName: string;
  demoDate: string;
  createdAt: Date;
  /** Same model number + serial number + invoice number as the one being checked. */
  sameCombination: boolean;
}

export interface DemoHistoryResult {
  entries: DemoHistoryEntry[];
  /**
   * Non-cancelled demos with the same model number + serial number + invoice number
   * combination — what the repeat-demo warning counts (spec.md D4). 0 until all three are known.
   */
  activeCount: number;
  /** True when this would be at least the 3rd demo for that combination (spec.md D4). */
  warning: boolean;
}

export const REPEAT_DEMO_WARNING_THRESHOLD = 2;

const normalise = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/**
 * Earlier demo tickets for the same machine or purchase (FR-007): listed when the serial
 * number OR invoice number matches, case/space-insensitive, within the caller's visible
 * stores (the same scoping rule as service history), newest first. The repeat-demo warning
 * only counts entries whose model number, serial number AND invoice number all match.
 */
export async function lookupDemoHistory(
  caller: SessionUser,
  key: {
    machineModel?: string | null;
    serialNumber?: string | null;
    invoiceNumber?: string | null;
    excludeId?: string | null;
  },
): Promise<DemoHistoryResult> {
  const serial = normalise(key.serialNumber);
  const invoice = normalise(key.invoiceNumber);
  const model = normalise(key.machineModel);
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

  const rows = await db
    .select({
      id: demoTickets.id,
      ticketNumber: demoTickets.ticketNumber,
      status: demoTickets.status,
      machineModel: demoTickets.machineModel,
      serialNumber: demoTickets.serialNumber,
      invoiceNumber: demoTickets.invoiceNumber,
      demoServiceName: demoTickets.demoServiceName,
      demoDate: demoTickets.demoDate,
      createdAt: demoTickets.createdAt,
    })
    .from(demoTickets)
    .where(and(...conditions))
    .orderBy(desc(demoTickets.createdAt));

  const entries = rows.map((row) => ({
    ...row,
    sameCombination:
      !!model &&
      !!serial &&
      !!invoice &&
      normalise(row.machineModel) === model &&
      normalise(row.serialNumber) === serial &&
      normalise(row.invoiceNumber) === invoice,
  }));
  const activeCount = entries.filter((e) => e.sameCombination && e.status !== "cancelled").length;
  return { entries, activeCount, warning: activeCount >= REPEAT_DEMO_WARNING_THRESHOLD };
}
