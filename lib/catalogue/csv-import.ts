import { parse } from "csv-parse/sync";
import { db } from "@/lib/db/client";
import { demoServices, parts, services } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface ImportFailure {
  row: number;
  reason: string;
}

export interface ImportResult {
  imported: number;
  failed: ImportFailure[];
}

/**
 * Each row is validated and inserted independently (FR-013, research.md §4) — a bad row
 * is reported with a reason, never causing the whole file to be rejected. Duplicate-name
 * checks consider both existing active catalogue rows AND names already imported earlier
 * in this same batch, since two rows in one file can collide with each other, not only
 * with pre-existing data.
 */
export async function importPartsCsv(csvContent: string): Promise<ImportResult> {
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const failed: ImportFailure[] = [];
  let imported = 0;
  const namesSeenThisBatch = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNumber = i + 2; // +1 for 1-indexing, +1 for the header row
    const name = row.name?.trim();
    const sku = row.sku?.trim() || null;
    const category = row.category?.trim() || null;
    const unitCostRaw = row.unit_cost?.trim();

    if (!name) {
      failed.push({ row: rowNumber, reason: "Missing required field: name" });
      continue;
    }
    if (!unitCostRaw) {
      failed.push({ row: rowNumber, reason: "Missing required field: unit_cost" });
      continue;
    }
    const unitCost = Number(unitCostRaw);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      failed.push({ row: rowNumber, reason: `Invalid unit_cost: "${unitCostRaw}"` });
      continue;
    }

    if (namesSeenThisBatch.has(name)) {
      failed.push({ row: rowNumber, reason: `Duplicate name in this file: "${name}"` });
      continue;
    }
    const existing = await db.select().from(parts).where(and(eq(parts.name, name), eq(parts.active, true))).limit(1);
    if (existing.length > 0) {
      failed.push({ row: rowNumber, reason: `A part named "${name}" already exists` });
      continue;
    }

    await db.insert(parts).values({ name, sku, unitCost: unitCost.toFixed(2), category });
    namesSeenThisBatch.add(name);
    imported += 1;
  }

  return { imported, failed };
}

/**
 * Bulk import for the Services and Demo services catalogues (columns:
 * name,description,unit_cost) — the same row-by-row rules as importPartsCsv: each row
 * validated and inserted on its own, a bad row reported with a reason, and duplicate
 * names checked against active entries and earlier rows of the same file.
 */
async function importServiceLikeCsv(
  table: typeof services | typeof demoServices,
  noun: string,
  csvContent: string,
): Promise<ImportResult> {
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const failed: ImportFailure[] = [];
  let imported = 0;
  const namesSeenThisBatch = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNumber = i + 2; // +1 for 1-indexing, +1 for the header row
    const name = row.name?.trim();
    const description = row.description?.trim() || null;
    const unitCostRaw = row.unit_cost?.trim();

    if (!name) {
      failed.push({ row: rowNumber, reason: "Missing required field: name" });
      continue;
    }
    if (!unitCostRaw) {
      failed.push({ row: rowNumber, reason: "Missing required field: unit_cost" });
      continue;
    }
    const unitCost = Number(unitCostRaw);
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      failed.push({ row: rowNumber, reason: `Invalid unit_cost: "${unitCostRaw}"` });
      continue;
    }

    if (namesSeenThisBatch.has(name)) {
      failed.push({ row: rowNumber, reason: `Duplicate name in this file: "${name}"` });
      continue;
    }
    const existing = await db.select().from(table).where(and(eq(table.name, name), eq(table.active, true))).limit(1);
    if (existing.length > 0) {
      failed.push({ row: rowNumber, reason: `A ${noun} named "${name}" already exists` });
      continue;
    }

    await db.insert(table).values({ name, description, unitCost: unitCost.toFixed(2) });
    namesSeenThisBatch.add(name);
    imported += 1;
  }

  return { imported, failed };
}

export const importServicesCsv = (csvContent: string) => importServiceLikeCsv(services, "service", csvContent);
export const importDemoServicesCsv = (csvContent: string) => importServiceLikeCsv(demoServices, "demo service", csvContent);

