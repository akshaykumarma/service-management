import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { AccessDeniedError, requireReportsAccess } from "@/lib/auth/rbac";
import { getDemoTicketDetailsReport } from "@/lib/reporting/demo-ticket-details";
import { demoReportFilters } from "@/lib/reporting/demo-report-filters";

/**
 * The Reports page's demo tickets table (post-008 product feedback). Same
 * Service-Manager-and-up, store-scoped gate as the rest of /api/reports/*.
 */
export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  try {
    requireReportsAccess(caller);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  const tickets = await getDemoTicketDetailsReport(caller, demoReportFilters(request.nextUrl.searchParams));
  return NextResponse.json({ tickets });
}
