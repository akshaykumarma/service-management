import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createPasswordResetToken, isRateLimited } from "@/lib/auth/password-reset";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";
import { requireSameOrigin } from "@/lib/auth/csrf";

const GENERIC_MESSAGE = "If that email is registered, a reset link has been sent.";

export async function POST(request: NextRequest) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const { email } = await request.json();

  // Always the same response, whether or not the email exists or the request was rate
  // limited (FR-010) — no distinguishable signal either way.
  if (typeof email === "string" && !isRateLimited(email)) {
    const rows = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    const user = rows[0];
    if (user && user.active) {
      const token = await createPasswordResetToken(user.id);
      const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
      const resetUrl = `${baseUrl}/reset-password/${token}`;
      await sendPasswordResetEmail(user.email, resetUrl);
    }
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
