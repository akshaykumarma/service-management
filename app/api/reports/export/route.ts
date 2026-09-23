import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { assertAccess, AccessDeniedError, requireAdminOrAbove } from "@/lib/auth/rbac";
import { queryScopedTickets } from "@/lib/board/ticket-query";
import { toTicketCard } from "@/lib/board/card-shape";
import { getSummaryReport } from "@/lib/reporting/summary";
import { summaryToCsv, ticketListToCsv } from "@/lib/reporting/csv-export";
import { summaryToPdf, ticketListToPdf } from "@/lib/reporting/pdf-export";
import type { TicketStatus } from "@/lib/tickets/status-transitions";

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
  const format = params.get("format");
  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json({ error: { code: "invalid_format" } }, { status: 400 });
  }

  if (params.get("type") === "summary") {
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

    if (format === "csv") {
      return new NextResponse(summaryToCsv(summary), {
        headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="summary-report.csv"' },
      });
    }
    const pdfBuffer = await summaryToPdf(summary);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="summary-report.pdf"' },
    });
  }

  // List export — the same filter params GET /api/tickets accepts, same scoped query.
  const storeIds = params.getAll("storeId");
  const statuses = params.getAll("status") as TicketStatus[];
  const rows = await queryScopedTickets(caller, {
    storeIds: storeIds.length > 0 ? storeIds : undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    ticketId: params.get("ticketId") ?? undefined,
    customerName: params.get("customerName") ?? undefined,
    customerPhone: params.get("customerPhone") ?? undefined,
    machineModel: params.get("machineModel") ?? undefined,
    technicianId: params.get("technicianId") ?? undefined,
    includeCancelled: params.get("includeCancelled") === "true",
  });
  const cards = rows.map(toTicketCard);

  if (format === "csv") {
    return new NextResponse(ticketListToCsv(cards), {
      headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="tickets.csv"' },
    });
  }
  const pdfBuffer = await ticketListToPdf(cards);
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="tickets.pdf"' },
  });
}
