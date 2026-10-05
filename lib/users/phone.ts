/**
 * A user's optional WhatsApp number (008-demo-board FR-011). Blank clears it; otherwise
 * it must contain 8–15 digits, optionally with a leading "+", spaces or dashes — loose on
 * purpose, the same way customer phone numbers are taken at intake.
 */
export function normalizeUserPhone(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false };
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^\+?[\d\s-]+$/.test(trimmed)) return { ok: false };
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return { ok: false };
  return { ok: true, value: trimmed };
}
