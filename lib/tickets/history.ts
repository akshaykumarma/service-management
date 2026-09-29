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
  serialNumber: string | null;
  customerPhone: string;
}

// Deviation (post-v1, per direct product feedback): history used to match on machine
// model alone, which lumped every customer's machine of the same model together. It now
// identifies one physical machine for one customer — the serial number AND the phone
// number together. Both sides are normalised in SQL so trivial formatting differences
// don't hide a match: serials ignore case and surrounding spaces; phones compare on
// their last 10 digits (so "+91 90190 55667" and "9019055667" are the same number).
const normalisedSerial = sql`lower(trim(${tickets.serialNumber}))`;
const normalisedPhone = sql`right(regexp_replace(${tickets.customerPhone}, '\\D', '', 'g'), 10)`;

function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/**
 * Single query, scoped to the caller's role/store visibility — the same scoping rule used
 * everywhere else (lib/auth/rbac.ts), not a second independent implementation of it.
 */
export async function lookupHistory(
  caller: SessionUser,
  key: HistoryKey,
): Promise<{ found: boolean; entries: HistoryEntry[] }> {
  const serial = key.serialNumber?.trim().toLowerCase();
  const phone = phoneKey(key.customerPhone);
  if (!serial || !phone) {
    return { found: false, entries: [] };
  }

  const scope = await getScopedStoreIds(caller);
  if (scope !== "all" && scope.length === 0) {
    return { found: false, entries: [] };
  }

  const baseCondition = and(
    sql`${normalisedSerial} = ${serial}`,
    sql`${normalisedPhone} = ${phone}`,
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

