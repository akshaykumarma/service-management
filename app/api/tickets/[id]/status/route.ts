import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { applyStatusTransition, checkTransition } from "@/lib/tickets/status-transitions";

const STATUS_CODE_FOR_ERROR = {
  invalid_transition: 400,
  comment_required: 400,
  role_not_permitted: 403,
} as const;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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
    await assertAccess(caller, ticket.storeId);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
    }
    throw err;
  }

  const { toStatus, comment } = await request.json();

  const transitionError = checkTransition({
    role: caller.role,
    fromStatus: ticket.status,
    toStatus,
    comment: comment ?? null,
  });

  if (transitionError) {
    return NextResponse.json(
      { error: { code: transitionError } },
      { status: STATUS_CODE_FOR_ERROR[transitionError] },
    );
  }

  // Plain UPDATE, no optimistic-concurrency check (research.md §2 — required by FR-019):
  // the second concurrent request to reach here simply overwrites tickets.status, and
  // every request that passes validation unconditionally inserts its own history row.
  const { updatedTicket, historyEntry } = await applyStatusTransition({
    ticket,
    toStatus,
    comment: comment ?? null,
    actorId: caller.id,
  });

  return NextResponse.json({ ticket: updatedTicket, historyEntry });
}
