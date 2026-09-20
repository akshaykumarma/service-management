import { parse } from "csv-parse/sync";
import { db } from "@/lib/db/client";
import { machineModels } from "@/lib/db/schema";
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
 * Mirrors lib/catalogue/csv-import.ts's exact pattern (`research.md` §6): each row
 * validated and inserted independently, a bad row reported with a reason rather than
 * failing the whole file. Duplicate-name checks consider both existing active rows and
 * names already imported earlier in this same batch.
 */
export async function importMachineModelsCsv(csvContent: string): Promise<ImportResult> {
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
    const manufacturer = row.manufacturer?.trim();
    const category = row.category?.trim() || null;

    if (!name) {
      failed.push({ row: rowNumber, reason: "Missing required field: name" });
      continue;
    }
    if (!manufacturer) {
      failed.push({ row: rowNumber, reason: "Missing required field: manufacturer" });
      continue;
    }

    if (namesSeenThisBatch.has(name)) {
      failed.push({ row: rowNumber, reason: `Duplicate name in this file: "${name}"` });
      continue;
    }
    const existing = await db
      .select()
      .from(machineModels)
      .where(and(eq(machineModels.name, name), eq(machineModels.active, true)))
      .limit(1);
    if (existing.length > 0) {
      failed.push({ row: rowNumber, reason: `A machine model named "${name}" already exists` });
      continue;
    }

    await db.insert(machineModels).values({ name, manufacturer, category });
    namesSeenThisBatch.add(name);
    imported += 1;
  }

  return { imported, failed };
}
