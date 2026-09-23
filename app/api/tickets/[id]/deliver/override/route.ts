import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertTicketAccess, AccessDeniedError, requireAdminOrAbove } from "@/lib/auth/rbac";
import { correctionRetryHasFailed, overrideToDelivered } from "@/lib/delivery/override";

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

  try {
    requireAdminOrAbove(caller);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  if (ticket.status !== "completed") {
    return NextResponse.json({ error: { code: "ticket_not_completed" } }, { status: 409 });
  }

  if (!(await correctionRetryHasFailed(ticket.id))) {
    return NextResponse.json({ error: { code: "correction_not_yet_attempted" } }, { status: 409 });
  }

  const { reason } = await request.json();
  const { updatedTicket, overrideRow } = await overrideToDelivered(ticket, reason, caller.id);

  return NextResponse.json({
    ticket: { status: updatedTicket.status },
    override: { reason: overrideRow.reason, overriddenBy: overrideRow.overriddenBy, createdAt: overrideRow.createdAt },
  });
}
