/**
 * FR-017 names six placeholders as the required minimum ("at minimum: customer name,
 * ticket ID, machine model, bill total, store name, and store phone number"). `otp_code`
 * is added beyond that minimum since the OTP template cannot function without a way to
 * insert the actual one-time code — "at minimum" leaves room for this, and spec.md's
 * User Story 3 requires the code to reach the customer somehow.
 */
export const ALLOWED_PLACEHOLDERS = [
  "customer_name",
  "ticket_id",
  "machine_model",
  "bill_total",
  "store_name",
  "store_phone",
  "otp_code",
] as const;

export type PlaceholderToken = (typeof ALLOWED_PLACEHOLDERS)[number];

export function extractPlaceholders(body: string): string[] {
  const matches = [...body.matchAll(/\{\{(\w+)\}\}/g)];
  return matches.map((m) => m[1]);
}

/** Returns the first unsupported token found, or null if every placeholder is allowed (FR-019). */
export function findUnsupportedPlaceholder(body: string): string | null {
  for (const token of extractPlaceholders(body)) {
    if (!(ALLOWED_PLACEHOLDERS as readonly string[]).includes(token)) {
      return token;
    }
  }
  return null;
}

export function renderTemplate(body: string, values: Partial<Record<PlaceholderToken, string>>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, token) => values[token as PlaceholderToken] ?? match);
}

export const DEFAULT_TEMPLATE_BODY: Record<"completion" | "otp", string> = {
  completion:
    "Hi {{customer_name}}, your {{machine_model}} (Ticket {{ticket_id}}) is ready for pickup! " +
    "Total bill: {{bill_total}}. - {{store_name}} ({{store_phone}})",
  otp: "Your delivery verification code for Ticket {{ticket_id}} is {{otp_code}}. Valid for 10 minutes. Do not share this code.",
};
