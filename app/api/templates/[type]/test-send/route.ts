import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { AccessDeniedError, requireSuperAdmin } from "@/lib/auth/rbac";
import {
  getApprovedTemplateBody,
  getPendingOrApprovedTemplateBody,
  renderTemplate,
  SAMPLE_PLACEHOLDER_VALUES,
  type TemplateType,
} from "@/lib/whatsapp/templates";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

function isTemplateType(value: string): value is TemplateType {
  return value === "completion" || value === "otp";
}

/**
 * `usePending: true` renders the not-yet-approved wording directly, bypassing the Meta
 * API entirely — an unapproved template can't actually be sent outside a
 * customer-initiated session (contracts/notifications-api.md), so this is
 * preview-only: no WhatsApp call, no `notifications` row.
 *
 * `usePending` false/omitted tests the currently *approved* template for real, since
 * that one Meta will accept — actually sends and records a `notifications` row with
 * `ticketId: null` (data-model.md's documented reason that column is nullable).
 */
export async function POST(request: NextRequest, { params }: { params: { type: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  try {
    requireSuperAdmin(sessionOrResponse.user);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  if (!isTemplateType(params.type)) {
    return NextResponse.json({ error: { code: "not_found", message: "No such template type." } }, { status: 404 });
  }

  const { phone, usePending } = await request.json();

  if (usePending) {
    const body = await getPendingOrApprovedTemplateBody(params.type);
    const renderedContent = renderTemplate(body, SAMPLE_PLACEHOLDER_VALUES);
    return NextResponse.json({ renderedContent });
  }

  const body = await getApprovedTemplateBody(params.type);
  const renderedContent = renderTemplate(body, SAMPLE_PLACEHOLDER_VALUES);

  let messageId: string | null = null;
  try {
    const result = await sendWhatsAppMessage({ to: phone, templateType: params.type, params: SAMPLE_PLACEHOLDER_VALUES });
    messageId = result.messageId;
  } catch {
    // Recorded as a failed notification below, same as any other send failure.
  }

  await db.insert(notifications).values({
    ticketId: null,
    type: params.type,
    recipientPhone: phone,
    renderedContent,
    status: messageId ? "sent" : "failed",
    messageId,
  });

  return NextResponse.json({ renderedContent });
}
