import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface Bill {
  subtotal: number;
  taxAmount: number;
  total: number;
}

/**
 * All arithmetic (sum, multiplication) happens in PostgreSQL NUMERIC, never JS floating
 * point (research.md §2 — SC-001's "zero calculation discrepancies").
 *
 * Deviation from research.md §3's original design (tax read live from the store's fixed
 * rate): per direct product feedback, tax is now a per-ticket value the Service Manager
 * sets and edits directly (tickets.tax_rate, defaulting to 0% — see updateTicketTaxRate()
 * in lib/billing/line-items.ts), not inherited from the store. Still read live here, not
 * snapshotted per line item — editing it immediately re-prices the whole bill, same
 * "live, not snapshotted" property the store rate used to have.
 */
export async function calculateBill(ticketId: string): Promise<Bill> {
  const result = await db.execute<{ subtotal: string; tax_amount: string; total: string }>(sql`
    SELECT
      COALESCE(SUM(tli.line_total), 0)::numeric(12,2) AS subtotal,
      (COALESCE(SUM(tli.line_total), 0) * t.tax_rate / 100)::numeric(12,2) AS tax_amount,
      (COALESCE(SUM(tli.line_total), 0) * (1 + t.tax_rate / 100))::numeric(12,2) AS total
    FROM tickets t
    LEFT JOIN ticket_line_items tli ON tli.ticket_id = t.id
    WHERE t.id = ${ticketId}
    GROUP BY t.tax_rate
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
