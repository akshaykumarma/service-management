import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { resendOtp } from "@/lib/delivery/otp";
import { enqueueOtpSend } from "@/lib/delivery/send-otp-message";

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

  const result = await resendOtp(ticket.id);

  switch (result.result) {
    // Not documented in contracts/notifications-api.md (which only covers the cooldown
    // and already-used cases) — an inactive/nonexistent attempt is the same underlying
    // "nothing to resend" state as resend_already_used, so it reuses that error code.
    case "no_active_attempt":
      return NextResponse.json({ error: { code: "resend_already_used" } }, { status: 409 });
    case "already_used":
      return NextResponse.json({ error: { code: "resend_already_used" } }, { status: 409 });
    case "cooldown":
      return NextResponse.json(
        { error: { code: "cooldown_active", retryAfterSeconds: result.retryAfterSeconds } },
        { status: 429 },
      );
    case "sent": {
      await enqueueOtpSend(ticket, result.code);
      return new NextResponse(null, { status: 202 });
    }
  }
}
