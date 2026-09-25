// Applied at Technician account creation (POST /api/auth/users) when the caller leaves
// the password field blank — per product feedback, a Technician's password is optional
// at creation, unlike every other role, and falls back to this fixed default rather than
// a per-account generated one. It satisfies isValidPassword below.
export const DEFAULT_TECHNICIAN_PASSWORD = "Password@123";

/**
 * At least 8 characters, one uppercase, one lowercase, one special (non-alphanumeric)
 * character. Applied wherever a password is set directly by an admin or the user
 * themselves (account creation, admin-initiated reset, self-service reset) — one rule,
 * not a copy per call site.
 */
export function isValidPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}
