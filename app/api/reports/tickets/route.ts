import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { AccessDeniedError, requireAdminOrAbove } from "@/lib/auth/rbac";
import { getTicketDetailsReport } from "@/lib/reporting/ticket-details";
import type { TicketStatus } from "@/lib/tickets/status-transitions";

/**
 * The Reports page's table view (post-006 product feedback): every ticket's full detail,
 * across every status, for a date range — as opposed to /api/reports/summary's
 * first-Completed-only counts. Same Admin-or-above gate as the rest of /api/reports/*.
 */
export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  try {
    requireAdminOrAbove(caller);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  const params = request.nextUrl.searchParams;
  const storeIds = params.getAll("storeId");
  const statuses = params.getAll("status") as TicketStatus[];

  const tickets = await getTicketDetailsReport(caller, {
    storeIds: storeIds.length > 0 ? storeIds : undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    ticketId: params.get("ticketId") ?? undefined,
    customerName: params.get("customerName") ?? undefined,
    customerPhone: params.get("customerPhone") ?? undefined,
    machineModel: params.get("machineModel") ?? undefined,
  });

  return NextResponse.json({ tickets });
}
