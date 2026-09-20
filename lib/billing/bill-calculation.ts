import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface Bill {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/**
 * All arithmetic (sum, multiplication) happens in PostgreSQL NUMERIC, never JS floating
 * point (research.md §2 — SC-001's "zero calculation discrepancies"). Tax is read live
 * from the store's current rate (research.md §3), not snapshotted.
 */
export async function calculateBill(ticketId: string): Promise<Bill> {
  const result = await db.execute<{ subtotal: string; tax_amount: string; total: string }>(sql`
    SELECT
      COALESCE(SUM(tli.line_total), 0)::numeric(12,2) AS subtotal,
      (COALESCE(SUM(tli.line_total), 0) * s.tax_rate / 100)::numeric(12,2) AS tax_amount,
      (COALESCE(SUM(tli.line_total), 0) * (1 + s.tax_rate / 100))::numeric(12,2) AS total
    FROM tickets t
    JOIN stores s ON s.id = t.store_id
    LEFT JOIN ticket_line_items tli ON tli.ticket_id = t.id
    WHERE t.id = ${ticketId}
    GROUP BY s.tax_rate
  `);

  const row = result.rows[0];
  if (!row) {
    return { subtotal: 0, taxAmount: 0, total: 0 };
  }

  return {
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.tax_amount),
    total: Number(row.total),
  };
}
