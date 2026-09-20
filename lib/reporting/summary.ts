import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export interface SummaryReport {
  totalTickets: number;
  byStatus: Record<string, number>;
  avgResolutionTimeHours: number;
  partsRevenue: number;
  servicesRevenue: number;
}

const ALL_STATUSES = ["open", "in_progress", "on_hold", "completed", "delivered", "cancelled"];

interface TicketAggregateRow {
  [key: string]: unknown;
  status: string;
  created_at: Date;
  first_completed_at: Date;
  parts_total: string;
  services_total: string;
}

/**
 * FR-017/FR-018: only tickets whose FIRST "Completed" timestamp falls within
 * [dateFrom, dateTo] are counted (not creation date) — `first_completed_at` is joined
 * once per ticket here (data-model.md), not recomputed per aggregate row. Resolution
 * time is Open (`created_at`) to first-Completed, excluding any later pickup wait.
 */
export async function getSummaryReport(storeId: string, dateFrom: Date, dateTo: Date): Promise<SummaryReport> {
  const result = await db.execute<TicketAggregateRow>(sql`
    WITH first_completed AS (
      SELECT ticket_id, MIN(created_at) AS first_completed_at
      FROM status_history
      WHERE to_status = 'completed'
      GROUP BY ticket_id
    )
    SELECT
      t.status,
      t.created_at,
      fc.first_completed_at,
      COALESCE(SUM(tli.line_total) FILTER (WHERE tli.item_type = 'part'), 0) AS parts_total,
      COALESCE(SUM(tli.line_total) FILTER (WHERE tli.item_type = 'service'), 0) AS services_total
    FROM tickets t
    JOIN first_completed fc ON fc.ticket_id = t.id
    LEFT JOIN ticket_line_items tli ON tli.ticket_id = t.id
    WHERE t.store_id = ${storeId}
      AND fc.first_completed_at >= ${dateFrom}
      AND fc.first_completed_at <= ${dateTo}
    GROUP BY t.id, t.status, t.created_at, fc.first_completed_at
  `);

  const rows = result.rows;
  const byStatus: Record<string, number> = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));
  let partsRevenue = 0;
  let servicesRevenue = 0;
  let totalResolutionHours = 0;

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    partsRevenue += Number(row.parts_total);
    servicesRevenue += Number(row.services_total);
    const hours = (new Date(row.first_completed_at).getTime() - new Date(row.created_at).getTime()) / (1000 * 60 * 60);
    totalResolutionHours += hours;
  }

  return {
    totalTickets: rows.length,
    byStatus,
    avgResolutionTimeHours: rows.length > 0 ? totalResolutionHours / rows.length : 0,
    partsRevenue,
    servicesRevenue,
  };
}
