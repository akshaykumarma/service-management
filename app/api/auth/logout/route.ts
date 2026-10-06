import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { recordLoginEvent } from "@/lib/auth/login-events";
import { deleteSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { clearSessionCookie } from "@/lib/auth/cookies";
import { requireSameOrigin } from "@/lib/auth/csrf";

export async function POST(request: NextRequest) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const rows = await db
      .select({ userId: users.id, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.sessionToken, token))
      .limit(1);
    await deleteSession(token);
    if (rows[0]) {
      await recordLoginEvent({ userId: rows[0].userId, identifier: rows[0].email, outcome: "logout", request });
    }
  }

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
