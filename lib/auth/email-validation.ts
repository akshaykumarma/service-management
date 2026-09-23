/**
 * A pragmatic format check (not full RFC 5322) — good enough to reject an obvious typo
 * before it becomes an unreachable staff account, without rejecting real addresses RFC
 * 5322 permits but production mail systems rarely do anyway.
 */
export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
