import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { parts } from "@/lib/db/schema";

export type PartError = "invalid_unit_cost" | "duplicate_name";

export function validateUnitCost(unitCost: unknown): boolean {
  return typeof unitCost === "number" && Number.isFinite(unitCost) && unitCost >= 0;
}

export async function isDuplicateActiveName(name: string): Promise<boolean> {
  const rows = await db.select().from(parts).where(and(eq(parts.name, name), eq(parts.active, true))).limit(1);
  return rows.length > 0;
}

export async function createPart(input: {
  name: string;
  sku?: string | null;
  unitCost: number;
  category?: string | null;
}): Promise<{ error: PartError } | { part: typeof parts.$inferSelect }> {
  if (!validateUnitCost(input.unitCost)) return { error: "invalid_unit_cost" };
  if (await isDuplicateActiveName(input.name)) return { error: "duplicate_name" };

  const [part] = await db
    .insert(parts)
    .values({
      name: input.name,
      sku: input.sku ?? null,
      unitCost: input.unitCost.toFixed(2),
      category: input.category ?? null,
    })
    .returning();

  return { part };
}

export async function listActiveParts() {
  return db.select().from(parts).where(eq(parts.active, true));
}

export async function updatePart(
  id: string,
  patch: { name?: string; sku?: string | null; unitCost?: number; category?: string | null; active?: boolean },
): Promise<{ error: PartError | "not_found" } | { part: typeof parts.$inferSelect }> {
  const existing = await db.select().from(parts).where(eq(parts.id, id)).limit(1);
  if (existing.length === 0) return { error: "not_found" };

  if (patch.unitCost !== undefined && !validateUnitCost(patch.unitCost)) {
    return { error: "invalid_unit_cost" };
  }

  const [updated] = await db
    .update(parts)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.sku !== undefined ? { sku: patch.sku } : {}),
      ...(patch.unitCost !== undefined ? { unitCost: patch.unitCost.toFixed(2) } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(parts.id, id))
    .returning();

  return { part: updated };
}
