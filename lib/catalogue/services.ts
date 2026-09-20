import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { services } from "@/lib/db/schema";
import { validateUnitCost } from "@/lib/catalogue/parts";

export type ServiceError = "invalid_unit_cost";

export async function createService(input: {
  name: string;
  description?: string | null;
  unitCost: number;
}): Promise<{ error: ServiceError } | { service: typeof services.$inferSelect }> {
  if (!validateUnitCost(input.unitCost)) return { error: "invalid_unit_cost" };

  const [service] = await db
    .insert(services)
    .values({
      name: input.name,
      description: input.description ?? null,
      unitCost: input.unitCost.toFixed(2),
    })
    .returning();

  return { service };
}

export async function listActiveServices() {
  return db.select().from(services).where(eq(services.active, true));
}

export async function updateService(
  id: string,
  patch: { name?: string; description?: string | null; unitCost?: number; active?: boolean },
): Promise<{ error: ServiceError | "not_found" } | { service: typeof services.$inferSelect }> {
  const existing = await db.select().from(services).where(eq(services.id, id)).limit(1);
  if (existing.length === 0) return { error: "not_found" };

  if (patch.unitCost !== undefined && !validateUnitCost(patch.unitCost)) {
    return { error: "invalid_unit_cost" };
  }

  const [updated] = await db
    .update(services)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.unitCost !== undefined ? { unitCost: patch.unitCost.toFixed(2) } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(services.id, id))
    .returning();

  return { service: updated };
}
