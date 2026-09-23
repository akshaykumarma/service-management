import { stringify } from "csv-stringify/sync";
import type { TicketCard } from "@/lib/board/card-shape";
import type { SummaryReport } from "@/lib/reporting/summary";
import { formatDate } from "@/lib/format/date";

/** List export (contracts/board-reporting-api.md): same rows GET /api/tickets returns for the same filters. */
export function ticketListToCsv(tickets: TicketCard[]): string {
  const rows = tickets.map((t) => ({
    ticketNumber: t.ticketNumber,
    customerName: t.customerName,
    machineModel: t.machineModel,
    status: t.status,
    createdAt: formatDate(t.createdAt),
    daysOpen: t.daysOpen,
  }));
  return stringify(rows, { header: true });
}

/** Summary export: same aggregates GET /api/reports/summary returns for the same store/date-range. */
export function summaryToCsv(summary: SummaryReport): string {
  const rows = [
    { metric: "Total tickets", value: summary.totalTickets },
    ...Object.entries(summary.byStatus).map(([status, count]) => ({ metric: `Status: ${status}`, value: count })),
    { metric: "Average resolution time (hours)", value: summary.avgResolutionTimeHours.toFixed(2) },
    { metric: "Parts revenue", value: summary.partsRevenue.toFixed(2) },
    { metric: "Services revenue", value: summary.servicesRevenue.toFixed(2) },
  ];
  return stringify(rows, { header: true });
}
