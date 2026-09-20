import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { assertAccess, AccessDeniedError, requireAdminOrAbove } from "@/lib/auth/rbac";
import { getSummaryReport } from "@/lib/reporting/summary";

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
  const storeId = params.get("storeId");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");

  if (!storeId || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: { code: "missing_required_field", field: !storeId ? "storeId" : !dateFrom ? "dateFrom" : "dateTo" } },
      { status: 400 },
    );
  }

  try {
    await assertAccess(caller, storeId);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "not_found", message: "No such store." } }, { status: 404 });
    }
    throw err;
  }

  const end = new Date(dateTo);
  end.setUTCHours(23, 59, 59, 999);
  const summary = await getSummaryReport(storeId, new Date(dateFrom), end);

  return NextResponse.json({
    totalTickets: summary.totalTickets,
    byStatus: summary.byStatus,
    avgResolutionTimeHours: summary.avgResolutionTimeHours,
    partsRevenue: summary.partsRevenue,
    servicesRevenue: summary.servicesRevenue,
  });
}
