import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { AccessDeniedError, requireSuperAdmin } from "@/lib/auth/rbac";
import { findUnsupportedPlaceholder, getTemplateEditorState, submitTemplateEdit, type TemplateType } from "@/lib/whatsapp/templates";

function isTemplateType(value: string): value is TemplateType {
  return value === "completion" || value === "otp";
}

export async function PATCH(request: NextRequest, { params }: { params: { type: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  try {
    requireSuperAdmin(caller);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  if (!isTemplateType(params.type)) {
    return NextResponse.json({ error: { code: "not_found", message: "No such template type." } }, { status: 404 });
  }

  const { body } = await request.json();
  const unsupported = findUnsupportedPlaceholder(body);
  if (unsupported) {
    return NextResponse.json({ error: { code: "unsupported_placeholder", token: unsupported } }, { status: 400 });
  }

  // FR-019/research.md §5: never goes live immediately — an append-only insert with
  // approval_status "pending"; the previously-approved body keeps being what real sends use.
  await submitTemplateEdit(params.type, body, caller.id);

  const state = await getTemplateEditorState(params.type);
  return NextResponse.json(state);
}
