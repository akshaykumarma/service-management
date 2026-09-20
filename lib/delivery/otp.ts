import { createHmac, randomInt } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { otpVerifications } from "@/lib/db/schema";

const OTP_VALIDITY_MS = 10 * 60 * 1000; // FR-008
const RESEND_COOLDOWN_MS = 60 * 1000; // FR-009
const MAX_FAILED_ATTEMPTS = 3; // FR-012

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function getSecret(): string {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) throw new Error("OTP_HASH_SECRET is not configured");
  return secret;
}

/** HMAC-SHA256, not bcrypt (research.md §2) — a fast keyed hash is the right tool for a
 * short-lived, single-use, already-rate-limited 6-digit code; plaintext is never stored. */
export function hashOtpCode(code: string): string {
  return createHmac("sha256", getSecret()).update(code).digest("hex");
}

export function verifyOtpCode(code: string, hash: string): boolean {
  return hashOtpCode(code) === hash;
}

type OtpRow = typeof otpVerifications.$inferSelect;

/**
 * data-model.md: "Only one active row per ticket_id at a time — a resend inserts a new
 * row [...] rather than mutating the code in place." No `superseded` column exists (or
 * is needed): the most-recently-issued row for a ticket IS the current one by
 * construction, so recency alone answers "which row is active" without an extra flag.
 */
async function latestRow(ticketId: string): Promise<OtpRow | undefined> {
  const rows = await db
    .select()
    .from(otpVerifications)
    .where(eq(otpVerifications.ticketId, ticketId))
    .orderBy(desc(otpVerifications.issuedAt))
    .limit(1);
  return rows[0];
}

/** Used by POST /deliver's 409 attempt_already_active gate. */
export async function hasActiveOtpAttempt(ticketId: string): Promise<boolean> {
  const row = await latestRow(ticketId);
  if (!row || row.locked || row.verifiedAt) return false;
  return row.expiresAt.getTime() > Date.now();
}

export async function issueOtp(ticketId: string): Promise<{ code: string }> {
  const code = generateOtpCode();
  const issuedAt = new Date();
  await db.insert(otpVerifications).values({
    ticketId,
    codeHash: hashOtpCode(code),
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + OTP_VALIDITY_MS),
  });
  return { code };
}

export type VerifyOtpResult =
  | { result: "verified"; verifiedAt: Date; verifiedBy: string }
  | { result: "incorrect"; attemptsRemaining: number }
  | { result: "locked" }
  | { result: "expired" };

/**
 * FR-012's "3 consecutive failures" is counted per *delivery attempt*, not per code — a
 * resend carries failed_attempts forward onto the new row (see resendOtp below) rather
 * than resetting it, since a resend is a continuation of the same attempt, not a fresh one.
 */
export async function verifyOtp(ticketId: string, code: string, verifiedBy: string): Promise<VerifyOtpResult> {
  const row = await latestRow(ticketId);
  if (!row) return { result: "expired" }; // no attempt was ever issued for this ticket

  if (row.locked) return { result: "locked" };
  if (row.expiresAt.getTime() <= Date.now()) return { result: "expired" };

  if (verifyOtpCode(code, row.codeHash)) {
    const verifiedAt = new Date();
    await db
      .update(otpVerifications)
      .set({ verifiedAt, verifiedBy })
      .where(eq(otpVerifications.id, row.id));
    return { result: "verified", verifiedAt, verifiedBy };
  }

  const failedAttempts = row.failedAttempts + 1;
  const locked = failedAttempts >= MAX_FAILED_ATTEMPTS;
  await db
    .update(otpVerifications)
    .set({ failedAttempts, locked })
    .where(eq(otpVerifications.id, row.id));

  if (locked) return { result: "locked" };
  return { result: "incorrect", attemptsRemaining: MAX_FAILED_ATTEMPTS - failedAttempts };
}

export type ResendOtpResult =
  | { result: "sent"; code: string }
  | { result: "cooldown"; retryAfterSeconds: number }
  | { result: "already_used" }
  | { result: "no_active_attempt" };

export async function resendOtp(ticketId: string): Promise<ResendOtpResult> {
  const row = await latestRow(ticketId);
  if (!row || row.locked || row.verifiedAt || row.expiresAt.getTime() <= Date.now()) {
    return { result: "no_active_attempt" };
  }
  if (row.resendUsed) return { result: "already_used" };

  const elapsedMs = Date.now() - row.issuedAt.getTime();
  if (elapsedMs < RESEND_COOLDOWN_MS) {
    return { result: "cooldown", retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000) };
  }

  const code = generateOtpCode();
  const issuedAt = new Date();
  await db.insert(otpVerifications).values({
    ticketId,
    codeHash: hashOtpCode(code),
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + OTP_VALIDITY_MS),
    failedAttempts: row.failedAttempts,
    // This new row IS the resend — marking it used here (not the prior row) is what
    // blocks a second resend, since latestRow() always resolves to this one from now on.
    resendUsed: true,
  });
  return { result: "sent", code };
}
