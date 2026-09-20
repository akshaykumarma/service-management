import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { AccessDeniedError, requireSuperAdmin } from "@/lib/auth/rbac";
import { getTemplateEditorState } from "@/lib/whatsapp/templates";

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

  const [completion, otp] = await Promise.all([getTemplateEditorState("completion"), getTemplateEditorState("otp")]);
  return NextResponse.json({ completion, otp });
}
