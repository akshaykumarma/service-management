import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { AccessDeniedError, requireSuperAdmin } from "@/lib/auth/rbac";
import { getTemplateEditorState, TEMPLATE_TYPES } from "@/lib/whatsapp/templates";

export async function GET(request: NextRequest) {
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

  const states = await Promise.all(TEMPLATE_TYPES.map((type) => getTemplateEditorState(type)));
  return NextResponse.json(Object.fromEntries(TEMPLATE_TYPES.map((type, i) => [type, states[i]])));
}
