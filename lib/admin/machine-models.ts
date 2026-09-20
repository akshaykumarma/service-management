import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { machineModels } from "@/lib/db/schema";

export type MachineModelError = "duplicate_name" | "not_found";

export async function isDuplicateActiveName(name: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(machineModels)
    .where(and(eq(machineModels.name, name), eq(machineModels.active, true)))
    .limit(1);
  return rows.length > 0;
}

export async function createMachineModel(input: {
  name: string;
  manufacturer: string;
  category?: string | null;
}): Promise<{ error: MachineModelError } | { machineModel: typeof machineModels.$inferSelect }> {
  if (await isDuplicateActiveName(input.name)) return { error: "duplicate_name" };

  const [machineModel] = await db
    .insert(machineModels)
    .values({ name: input.name, manufacturer: input.manufacturer, category: input.category ?? null })
    .returning();

  return { machineModel };
}

export async function listActiveMachineModels() {
  return db.select().from(machineModels).where(eq(machineModels.active, true));
}

export async function updateMachineModel(
  id: string,
  patch: { name?: string; manufacturer?: string; category?: string | null; active?: boolean },
): Promise<{ error: MachineModelError } | { machineModel: typeof machineModels.$inferSelect }> {
  const existing = await db.select().from(machineModels).where(eq(machineModels.id, id)).limit(1);
  if (existing.length === 0) return { error: "not_found" };

  const [updated] = await db
    .update(machineModels)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.manufacturer !== undefined ? { manufacturer: patch.manufacturer } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(machineModels.id, id))
    .returning();

  return { machineModel: updated };
}
