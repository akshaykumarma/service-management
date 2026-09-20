import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth/auth.config";
import { isLocked, recordFailedAttempt, clearFailedAttempts } from "@/lib/auth/lockout";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { requireSameOrigin } from "@/lib/auth/csrf";

export async function POST(request: NextRequest) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const { email, password } = await request.json();

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: { code: "invalid_credentials", message: "Email and password are required." } },
      { status: 401 },
    );
  }

  const lockState = isLocked(email);
  if (lockState.locked) {
    return NextResponse.json(
      { error: { code: "account_locked", retryAfterSeconds: lockState.retryAfterSeconds } },
      { status: 423 },
    );
  }

  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  const user = rows[0];

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFailedAttempt(email);
    return NextResponse.json(
      { error: { code: "invalid_credentials", message: "Incorrect email or password." } },
      { status: 401 },
    );
  }

  if (!user.active) {
    // A deactivated account's correct credentials don't clear its lockout counter or
    // establish a session — this is a distinct denial reason from a wrong password.
    return NextResponse.json(
      { error: { code: "account_deactivated", message: "This account has been deactivated." } },
      { status: 403 },
    );
  }

  clearFailedAttempts(email);
  const { token, expiresAt } = await createSession(user.id);

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  setSessionCookie(response, token, expiresAt);
  return response;
}
