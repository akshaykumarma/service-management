import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { loadAccessibleDemoTicket } from "@/lib/demo/route-helpers";
import { applyDemoStatusTransition, checkDemoTransition, type DemoStatus } from "@/lib/demo/status-transitions";

const STATUS_CODE_FOR_ERROR = {
  invalid_transition: 400,
  comment_required: 400,
  technician_required: 400,
  role_not_permitted: 403,
} as const;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const ticket = await loadAccessibleDemoTicket(caller, params.id);
  if (ticket instanceof NextResponse) return ticket;

  const { toStatus, comment } = await request.json();
  const trimmedComment = typeof comment === "string" && comment.trim() ? comment.trim() : null;
  const error = checkDemoTransition({
    role: caller.role,
    fromStatus: ticket.status,
    toStatus: toStatus as DemoStatus,
    comment: trimmedComment,
    hasTechnician: Boolean(ticket.assignedTechnicianId),
  });
  if (error) return NextResponse.json({ error: { code: error } }, { status: STATUS_CODE_FOR_ERROR[error] });

  const updated = await applyDemoStatusTransition({ ticket, toStatus, comment: trimmedComment, actorId: caller.id });
  return NextResponse.json({ ticket: updated });
}
