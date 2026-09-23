import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertTicketAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { verifyOtp } from "@/lib/delivery/otp";
import { applyStatusTransition } from "@/lib/tickets/status-transitions";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const rows = await db.select().from(tickets).where(eq(tickets.id, params.id)).limit(1);
  const ticket = rows[0];
  if (!ticket) {
    return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
  }

  try {
    await assertTicketAccess(caller, ticket);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
    }
    throw err;
  }

  const { code } = await request.json();
  const result = await verifyOtp(ticket.id, code, caller.id);

  switch (result.result) {
    case "locked":
      return NextResponse.json({ error: { code: "locked" } }, { status: 423 });
    case "expired":
      return NextResponse.json({ error: { code: "code_expired" } }, { status: 400 });
    case "incorrect":
      return NextResponse.json(
        { error: { code: "incorrect_code", attemptsRemaining: result.attemptsRemaining } },
        { status: 400 },
      );
    case "verified": {
      // FR-010/FR-014: this is the only place a ticket reaches "Delivered" via the OTP
      // flow — reuses 003's own status-transition function (applyStatusTransition), not
      // a second write path, same as 005's completion-notification hook.
      const { updatedTicket } = await applyStatusTransition({
        ticket,
        toStatus: "delivered",
        comment: null,
        actorId: caller.id,
      });
      return NextResponse.json({
        ticket: { status: updatedTicket.status },
        deliveredAt: result.verifiedAt,
        verifiedBy: result.verifiedBy,
      });
    }
  }
}
