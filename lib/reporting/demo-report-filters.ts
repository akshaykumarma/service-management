import type { DemoTicketFilters } from "@/lib/demo/query";
import type { DemoStatus } from "@/lib/demo/status-transitions";

/** Query-string → filters for the demo report table and its exports (kept identical). */
export function demoReportFilters(params: URLSearchParams): DemoTicketFilters {
  const storeIds = params.getAll("storeId");
  const statuses = params.getAll("status") as DemoStatus[];
  return {
    storeIds: storeIds.length ? storeIds : undefined,
    statuses: statuses.length ? statuses : undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    ticketId: params.get("ticketId") ?? undefined,
    customerName: params.get("customerName") ?? undefined,
    customerPhone: params.get("customerPhone") ?? undefined,
    machineModel: params.get("machineModel") ?? undefined,
    technicianId: params.get("technicianId") ?? undefined,
    serialNumber: params.get("serialNumber") ?? undefined,
    invoiceNumber: params.get("invoiceNumber") ?? undefined,
  };
}
