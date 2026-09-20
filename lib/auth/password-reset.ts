import { randomBytes, createHash } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { passwordResetTokens } from "@/lib/db/schema";

const TOKEN_LIFETIME_MS = 30 * 60 * 1000; // 30 minutes, FR-008
const RATE_LIMIT_MAX_PER_HOUR = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Hardening beyond spec.md (research.md §7): throttles reset *requests* per email to
 * blunt mail-bombing/enumeration-by-timing, without ever surfacing the limit to the
 * caller (the response is identical either way, per FR-010).
 */
export const resetRequestCounts = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(email: string): boolean {
  const key = email.trim().toLowerCase();
  const now = Date.now();
  const record = resetRequestCounts.get(key);

  if (!record || now - record.windowStart >= RATE_LIMIT_WINDOW_MS) {
    resetRequestCounts.set(key, { count: 1, windowStart: now });
    return false;
  }

  record.count += 1;
  return record.count > RATE_LIMIT_MAX_PER_HOUR;
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const plaintext = randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash: hashToken(plaintext),
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
  });
  return plaintext;
}

/**
 * Validates and marks a reset token used in one step; returns the associated userId, or
 * null if the token is unknown, already used, or past its 30-minute expiry (FR-009).
 */
export async function verifyAndConsumeToken(plaintext: string): Promise<string | null> {
  const tokenHash = hashToken(plaintext);
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (Date.now() >= row.expiresAt.getTime()) return null;

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  return row.userId;
}
