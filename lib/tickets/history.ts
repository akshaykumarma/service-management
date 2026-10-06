import { and, desc, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { getScopedStoreIds } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";

const CLOSED_STATUSES = ["completed", "delivered"] as const;

export interface HistoryEntry {
  id: string;
  ticketNumber: string;
  status: string;
  machineModel: string;
  issueDescription: string;
  createdAt: Date;
}

export interface HistoryKey {
  machineModel: string | null;
  serialNumber: string | null;
}

// Deviation (post-v1, per direct product feedback): history first matched on machine
// model alone (every customer's machine of that model lumped together), then on serial
// number + customer phone. It now follows the physical machine — the model number AND
// the serial number together, the same machine identity the Demo Board's repeat-demo
// check uses — whoever brings it in. Both sides are normalised in SQL (case and
// surrounding spaces ignored) so trivial formatting differences don't hide a match.
const normalisedModel = sql`lower(trim(${tickets.machineModel}))`;
const normalisedSerial = sql`lower(trim(${tickets.serialNumber}))`;

/**
 * Single query, scoped to the caller's role/store visibility — the same scoping rule used
 * everywhere else (lib/auth/rbac.ts), not a second independent implementation of it.
 */
export async function lookupHistory(
  caller: SessionUser,
  key: HistoryKey,
): Promise<{ found: boolean; entries: HistoryEntry[] }> {
  const model = key.machineModel?.trim().toLowerCase();
  const serial = key.serialNumber?.trim().toLowerCase();
  if (!model || !serial) {
    return { found: false, entries: [] };
  }

  const scope = await getScopedStoreIds(caller);
  if (scope !== "all" && scope.length === 0) {
    return { found: false, entries: [] };
  }

  const baseCondition = and(
    sql`${normalisedModel} = ${model}`,
    sql`${normalisedSerial} = ${serial}`,
    inArray(tickets.status, [...CLOSED_STATUSES]),
  );
  // Store scoping is composed into the query itself (research.md §6) rather than fetched
  // unscoped and filtered in application code — the latter was explicitly rejected there.
  const condition = scope === "all" ? baseCondition : and(baseCondition, inArray(tickets.storeId, scope));

  const rows = await db
    .select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      status: tickets.status,
      machineModel: tickets.machineModel,
      issueDescription: tickets.issueDescription,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .where(condition)
    .orderBy(desc(tickets.createdAt));

  return { found: rows.length > 0, entries: rows };
}

