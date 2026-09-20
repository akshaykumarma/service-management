import { createHmac, randomInt } from "crypto";

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
