/** 3-32 chars, letters/digits/./_/- only, no spaces — a plain, unambiguous login handle. */
export function isValidUsername(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{3,32}$/.test(value.trim());
}
