import { eq, sql } from "drizzle-orm";
import type { db as Db } from "@/lib/db/client";
import { demoTicketNumberCounters, stores } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/**
 * `{storeCode}-DEMO-{year}-{seq:05}` (spec.md D2) — the same atomic per-store/per-year
 * upsert as lib/tickets/ticket-number.ts, on demo tickets' own counter so demo and
 * service numbering never interleave.
 */
export async function nextDemoTicketNumber(tx: Tx, storeId: string, now: Date = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const [store] = await tx.select({ storeCode: stores.storeCode }).from(stores).where(eq(stores.id, storeId)).limit(1);
  const [row] = await tx
    .insert(demoTicketNumberCounters)
    .values({ storeId, year, seq: 1 })
    .onConflictDoUpdate({
      target: [demoTicketNumberCounters.storeId, demoTicketNumberCounters.year],
      set: { seq: sql`${demoTicketNumberCounters.seq} + 1` },
    })
    .returning({ seq: demoTicketNumberCounters.seq });
  return `${store.storeCode}-DEMO-${year}-${String(row.seq).padStart(5, "0")}`;
}
