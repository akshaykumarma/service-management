import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { loadAccessibleDemoTicket } from "@/lib/demo/route-helpers";
import { assignDemoTechnician } from "@/lib/demo/assign";

/** Assign/reassign/clear the technician (US3); Service Manager and above, like service tickets. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const ticket = await loadAccessibleDemoTicket(caller, params.id);
  if (ticket instanceof NextResponse) return ticket;
  if (caller.role === "technician") {
    return NextResponse.json({ error: { code: "forbidden", message: "Technicians cannot assign tickets." } }, { status: 403 });
  }

  const { technicianId } = await request.json();
  if (technicianId !== null && technicianId !== undefined && typeof technicianId !== "string") {
    return NextResponse.json({ error: { code: "invalid_technician" } }, { status: 400 });
  }
  const result = await assignDemoTechnician(ticket, technicianId || null, caller.id);
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error } }, { status: result.error === "ticket_locked" ? 409 : 400 });
  }
  return NextResponse.json(result);
}
