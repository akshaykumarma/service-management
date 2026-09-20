import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { messageTemplates } from "@/lib/db/schema";

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

/** Fills every placeholder for a Super Admin test-send preview, since it isn't tied to a real ticket. */
export const SAMPLE_PLACEHOLDER_VALUES: Record<PlaceholderToken, string> = {
  customer_name: "Sample Customer",
  ticket_id: "SVC-2026-00000",
  machine_model: "Sample Model X1",
  bill_total: "0.00",
  store_name: "Sample Store",
  store_phone: "+910000000000",
  otp_code: "000000",
};

export type TemplateType = "completion" | "otp";

async function latestTemplateRow(type: TemplateType) {
  const [row] = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.type, type))
    .orderBy(desc(messageTemplates.updatedAt))
    .limit(1);
  return row;
}

async function latestApprovedTemplateRow(type: TemplateType) {
  const [row] = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.type, type), eq(messageTemplates.approvalStatus, "approved")))
    .orderBy(desc(messageTemplates.updatedAt))
    .limit(1);
  return row;
}

/**
 * What every real send actually uses (research.md §5): a pending edit never affects
 * this — falls back to the built-in default until an edit is ever Meta-approved
 * (nothing in this codebase flips that state; it's an out-of-band step via Meta's own
 * console, per data-model.md's Message Template state transition note).
 */
export async function getApprovedTemplateBody(type: TemplateType): Promise<string> {
  const row = await latestApprovedTemplateRow(type);
  return row?.body ?? DEFAULT_TEMPLATE_BODY[type];
}

export interface TemplateEditorState {
  approved: { body: string; metaTemplateName: string | null; updatedAt: string | null };
  pending: { body: string; updatedAt: string } | null;
}

/** data-model.md: "most recent approved row" for real sends, "most recent row overall" for the editor. */
export async function getTemplateEditorState(type: TemplateType): Promise<TemplateEditorState> {
  const approvedRow = await latestApprovedTemplateRow(type);
  const latest = await latestTemplateRow(type);
  const hasPendingEdit = latest !== undefined && latest.approvalStatus === "pending";

  return {
    approved: {
      body: approvedRow?.body ?? DEFAULT_TEMPLATE_BODY[type],
      metaTemplateName: approvedRow?.metaTemplateName ?? null,
      updatedAt: approvedRow?.updatedAt.toISOString() ?? null,
    },
    pending: hasPendingEdit ? { body: latest.body, updatedAt: latest.updatedAt.toISOString() } : null,
  };
}

/** FR-019: validated by the caller before insert (findUnsupportedPlaceholder). Append-only — never updates in place, so the previously-approved body stays retrievable (data-model.md). */
export async function submitTemplateEdit(type: TemplateType, body: string, updatedBy: string): Promise<void> {
  await db.insert(messageTemplates).values({ type, body, approvalStatus: "pending", updatedBy });
}

/** The wording a test-send preview renders: the pending edit if one exists, else the current approved body. */
export async function getPendingOrApprovedTemplateBody(type: TemplateType): Promise<string> {
  const latest = await latestTemplateRow(type);
  if (latest && latest.approvalStatus === "pending") return latest.body;
  return getApprovedTemplateBody(type);
}
