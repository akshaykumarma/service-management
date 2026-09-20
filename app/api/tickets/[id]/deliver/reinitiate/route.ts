import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertAccess, AccessDeniedError, requireAdminOrAbove } from "@/lib/auth/rbac";
import { hasActiveOtpAttempt, issueOtp } from "@/lib/delivery/otp";
import { enqueueOtpSend } from "@/lib/delivery/send-otp-message";

/**
 * FR-013/FR-023: a Store Service Manager gets 403 here even though they can call the
 * original POST .../deliver — clearing a lockout (3-strikes or timeout-exhaustion) is
 * Admin/Super-Admin only.
 */
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
    await assertAccess(caller, ticket.storeId);
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

  // Reinitiate is for clearing a lockout, not a shortcut past the normal active-attempt
  // gate — a still-active (unlocked, unexpired, unverified) attempt uses the same
  // 409 as POST .../deliver.
  if (await hasActiveOtpAttempt(ticket.id)) {
    return NextResponse.json({ error: { code: "attempt_already_active" } }, { status: 409 });
  }

  // data-model.md: creates a new row with its own resend allowance; never clears
  // `locked` on the prior one (append-only history of attempts).
  const { code } = await issueOtp(ticket.id);
  await enqueueOtpSend(ticket, code);

  return new NextResponse(null, { status: 202 });
}
