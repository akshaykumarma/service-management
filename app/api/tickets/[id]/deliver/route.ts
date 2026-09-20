import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { hasActiveOtpAttempt, issueOtp } from "@/lib/delivery/otp";
import { renderTemplate, DEFAULT_TEMPLATE_BODY } from "@/lib/whatsapp/templates";
import { getBoss } from "@/lib/jobs/boss";
import { SEND_WHATSAPP_MESSAGE_QUEUE, type SendWhatsAppMessageJobData } from "@/jobs/send-whatsapp-message";

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

  if (ticket.status !== "completed") {
    return NextResponse.json({ error: { code: "ticket_not_completed" } }, { status: 409 });
  }

  if (await hasActiveOtpAttempt(ticket.id)) {
    return NextResponse.json({ error: { code: "attempt_already_active" } }, { status: 409 });
  }

  const { code } = await issueOtp(ticket.id);

  const boss = await getBoss();
  const jobData: SendWhatsAppMessageJobData = {
    ticketId: ticket.id,
    type: "otp",
    recipientPhone: ticket.customerPhone,
    templateParams: { ticket_id: ticket.ticketNumber, otp_code: code },
    // Redacted: never persist the real code (plan.md's Constraints — OTP codes never logged).
    storedContent: renderTemplate(DEFAULT_TEMPLATE_BODY.otp, { ticket_id: ticket.ticketNumber, otp_code: "REDACTED" }),
  };
  await boss.send(SEND_WHATSAPP_MESSAGE_QUEUE, jobData);

  return new NextResponse(null, { status: 202 });
}
