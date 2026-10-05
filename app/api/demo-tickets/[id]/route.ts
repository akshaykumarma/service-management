import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, users } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { loadAccessibleDemoTicket } from "@/lib/demo/route-helpers";
import { lookupDemoHistory } from "@/lib/demo/history";
import { editDemoTicketDetails } from "@/lib/demo/edit-details";
import { shortUrlFor } from "@/lib/demo/short-code";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const ticket = await loadAccessibleDemoTicket(caller, params.id);
  if (ticket instanceof NextResponse) return ticket;

  const [[store], technicianRows, demoHistory] = await Promise.all([
    db.select({ name: stores.name }).from(stores).where(eq(stores.id, ticket.storeId)).limit(1),
    ticket.assignedTechnicianId
      ? db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, ticket.assignedTechnicianId)).limit(1)
      : Promise.resolve([] as { name: string; phone: string | null }[]),
    lookupDemoHistory(caller, { serialNumber: ticket.serialNumber, invoiceNumber: ticket.invoiceNumber, excludeId: ticket.id }),
  ]);

  return NextResponse.json({
    ticket: {
      ...ticket,
      demoServicePrice: Number(ticket.demoServicePrice),
      storeName: store?.name ?? null,
      assignedTechnicianName: technicianRows[0]?.name ?? null,
      assignedTechnicianHasPhone: Boolean(technicianRows[0]?.phone),
      shortUrl: shortUrlFor(ticket.shortCode),
    },
    demoHistory,
  });
}

const EDIT_ERROR_STATUS: Record<string, number> = { ticket_locked: 409 };

/** Edit details (contracts/demo-tickets-api.md) — Service Manager and above. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const ticket = await loadAccessibleDemoTicket(caller, params.id);
  if (ticket instanceof NextResponse) return ticket;
  if (caller.role === "technician") {
    return NextResponse.json({ error: { code: "forbidden", message: "Technicians cannot edit demo ticket details." } }, { status: 403 });
  }

  const payload = await request.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: { code: "invalid_body" } }, { status: 400 });
  }
  const result = await editDemoTicketDetails(ticket, payload, caller.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: EDIT_ERROR_STATUS[result.error.code] ?? 400 });
  }
  return NextResponse.json({ ticket: result.ticket });
}
