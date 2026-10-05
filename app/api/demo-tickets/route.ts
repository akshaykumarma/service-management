import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { createDemoTicket } from "@/lib/demo/create";
import { lookupDemoHistory } from "@/lib/demo/history";
import { demoBoardCards, queryScopedDemoTickets } from "@/lib/demo/query";
import type { DemoStatus } from "@/lib/demo/status-transitions";

/** The Demo Board's data (contracts/demo-tickets-api.md): same filters as GET /api/tickets. */
export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const params = request.nextUrl.searchParams;
  const storeIds = params.getAll("storeId");
  const statuses = params.getAll("status") as DemoStatus[];
  const rows = await queryScopedDemoTickets(caller, {
    storeIds: storeIds.length ? storeIds : undefined,
    statuses: statuses.length ? statuses : undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    ticketId: params.get("ticketId") ?? undefined,
    customerName: params.get("customerName") ?? undefined,
    customerPhone: params.get("customerPhone") ?? undefined,
    machineModel: params.get("machineModel") ?? undefined,
    technicianId: params.get("technicianId") ?? undefined,
    includeCancelled: params.get("includeCancelled") === "true",
  });
  return NextResponse.json({ tickets: await demoBoardCards(rows) });
}

const CREATE_ERROR_STATUS: Record<string, number> = { store_inactive: 409 };

export async function POST(request: NextRequest) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const payload = await request.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: { code: "invalid_body" } }, { status: 400 });
  }
  if (typeof payload.storeId === "string" && payload.storeId) {
    try {
      await assertAccess(caller, payload.storeId);
    } catch (err) {
      if (err instanceof AccessDeniedError) {
        return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
      }
      throw err;
    }
  }

  const result = await createDemoTicket(payload, caller.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: CREATE_ERROR_STATUS[result.error.code] ?? 400 });
  }

  const history = await lookupDemoHistory(caller, {
    serialNumber: result.ticket.serialNumber,
    invoiceNumber: result.ticket.invoiceNumber,
    excludeId: result.ticket.id,
  });
  const { ticket } = result;
  return NextResponse.json(
    { ticket: { id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status, createdAt: ticket.createdAt }, history },
    { status: 201 },
  );
}
