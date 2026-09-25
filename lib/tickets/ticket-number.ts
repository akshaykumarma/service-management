import { eq, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db/client";
import { stores, ticketNumberCounters } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/**
 * Atomically issues the next sequence number for this store+year via a single upsert
 * (research.md §1) — no read-then-write race under concurrent creation.
 *
 * Deviation (post-v1, per direct product feedback): the prefix is the ticket's own
 * store's storeCode rather than a flat "SVC" for every store — each store now carries
 * its own 3-character code (data-model.md's stores table, migration 0014), assigned at
 * creation and mandatory. Still unique per (storeCode, year, seq) since storeCode itself
 * is unique across stores and the counter stays scoped by storeId internally.
 */
export async function nextTicketNumber(tx: Tx, storeId: string): Promise<string> {
  const year = new Date().getUTCFullYear();

  const [store] = await tx.select({ storeCode: stores.storeCode }).from(stores).where(eq(stores.id, storeId)).limit(1);

  const [row] = await tx
    .insert(ticketNumberCounters)
    .values({ storeId, year, seq: 1 })
    .onConflictDoUpdate({
      target: [ticketNumberCounters.storeId, ticketNumberCounters.year],
      set: { seq: sql`${ticketNumberCounters.seq} + 1` },
    })
    .returning({ seq: ticketNumberCounters.seq });

  const seq = String(row.seq).padStart(5, "0");
  return `${store.storeCode}-${year}-${seq}`;
}
