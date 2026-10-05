// 008-demo-board FR-008: the Catalogue's "Demo services" list — same fields, rules and
// actions as lib/catalogue/services.ts, over its own table.
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoServices } from "@/lib/db/schema";
import { validateUnitCost } from "@/lib/catalogue/parts";

export type DemoServiceError = "invalid_unit_cost";

export async function createDemoService(input: {
  name: string;
  description?: string | null;
  unitCost: number;
}): Promise<{ error: DemoServiceError } | { service: typeof demoServices.$inferSelect }> {
  if (!validateUnitCost(input.unitCost)) return { error: "invalid_unit_cost" };

  const [service] = await db
    .insert(demoServices)
    .values({
      name: input.name,
      description: input.description ?? null,
      unitCost: input.unitCost.toFixed(2),
    })
    .returning();

  return { service };
}

export async function listActiveDemoServices() {
  return db.select().from(demoServices).where(eq(demoServices.active, true));
}

export async function updateDemoService(
  id: string,
  patch: { name?: string; description?: string | null; unitCost?: number; active?: boolean },
): Promise<{ error: DemoServiceError | "not_found" } | { service: typeof demoServices.$inferSelect }> {
  const existing = await db.select().from(demoServices).where(eq(demoServices.id, id)).limit(1);
  if (existing.length === 0) return { error: "not_found" };

  if (patch.unitCost !== undefined && !validateUnitCost(patch.unitCost)) {
    return { error: "invalid_unit_cost" };
  }

  const [updated] = await db
    .update(demoServices)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.unitCost !== undefined ? { unitCost: patch.unitCost.toFixed(2) } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(demoServices.id, id))
    .returning();

  return { service: updated };
}
