import { eq } from "drizzle-orm";
import type { db as Db } from "@/lib/db/client";
import { customers } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

/**
 * Find-or-create a customer by phone, then unconditionally overwrite its name with the
 * value entered on this ticket (FR-020, research.md §3). The ticket itself still stores
 * its own customerName/customerPhone snapshot — this only maintains the canonical
 * cross-ticket identity, it does not change what any existing ticket displays.
 */
export async function resolveCustomer(
  tx: Tx,
  input: { name: string; phone: string },
): Promise<{ id: string }> {
  const existing = await tx.select().from(customers).where(eq(customers.phone, input.phone)).limit(1);

  if (existing.length > 0) {
    const [updated] = await tx
      .update(customers)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(customers.id, existing[0].id))
      .returning({ id: customers.id });
    return updated;
  }

  const [created] = await tx
    .insert(customers)
    .values({ name: input.name, phone: input.phone })
    .returning({ id: customers.id });
  return created;
}
