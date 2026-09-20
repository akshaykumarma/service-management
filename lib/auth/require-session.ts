import { NextRequest, NextResponse } from "next/server";
import { getValidSession, SESSION_COOKIE_NAME, type ValidSession } from "@/lib/auth/session";

export async function requireAuthenticatedSession(
  request: NextRequest,
): Promise<ValidSession | NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(token);
  if (!session) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "No valid session." } },
      { status: 401 },
    );
  }
  return session;
}
