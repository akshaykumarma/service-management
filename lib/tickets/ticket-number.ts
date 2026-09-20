import { sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db/client";
import { ticketNumberCounters } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/**
 * Atomically issues the next sequence number for this store+year via a single upsert
 * (research.md §1) — no read-then-write race under concurrent creation.
 */
export async function nextTicketNumber(tx: Tx, storeId: string): Promise<string> {
  const year = new Date().getUTCFullYear();

  const [row] = await tx
    .insert(ticketNumberCounters)
    .values({ storeId, year, seq: 1 })
    .onConflictDoUpdate({
      target: [ticketNumberCounters.storeId, ticketNumberCounters.year],
      set: { seq: sql`${ticketNumberCounters.seq} + 1` },
    })
    .returning({ seq: ticketNumberCounters.seq });

  const seq = String(row.seq).padStart(5, "0");
  return `SVC-${year}-${seq}`;
}
