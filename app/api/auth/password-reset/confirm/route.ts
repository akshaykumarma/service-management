import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { verifyAndConsumeToken } from "@/lib/auth/password-reset";
import { hashPassword } from "@/lib/auth/auth.config";
import { deleteAllSessionsForUser } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const { token, newPassword } = await request.json();

  if (typeof token !== "string" || typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json(
      { error: { code: "invalid_or_expired_token", message: "Invalid or expired reset token." } },
      { status: 400 },
    );
  }

  const userId = await verifyAndConsumeToken(token);
  if (!userId) {
    return NextResponse.json(
      { error: { code: "invalid_or_expired_token", message: "Invalid or expired reset token." } },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));

  // A reset implies "I may have been compromised" — a deliberate exception to FR-019's
  // "no explicit session termination," since this is a security-sensitive credential
  // rotation, not an authorization-state change.
  await deleteAllSessionsForUser(userId);

  return NextResponse.json({ message: "Password updated." });
}
