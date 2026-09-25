import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";

export type StoreError =
  | "invalid_tax_rate"
  | "invalid_whatsapp_number"
  | "invalid_store_code"
  | "store_code_already_registered"
  | "whatsapp_number_required_to_activate"
  | "not_found";

// Post-v1 product feedback: every store gets a mandatory 3-letter code, used as the
// ticket-number prefix in place of the old flat "SVC" (lib/tickets/ticket-number.ts).
// Letters only (no digits/punctuation) since it reads as a short mnemonic, not an id.
export function isValidStoreCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z]{3}$/.test(value);
}

/**
 * E.164-style format check only (`research.md` §4) — a store's WhatsApp number is
 * display/contact content (the `{{store_phone}}` placeholder, `005-customer-notifications`),
 * never validated against Meta's API or treated as a separate sending identity.
 */
export function isValidWhatsAppNumber(value: unknown): value is string {
  return typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value);
}

export function isValidTaxRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export async function createStore(input: {
  name: string;
  storeCode: string;
  address: string;
  primaryContact: string;
  whatsappNumber: string;
  taxRate: number;
}): Promise<{ error: StoreError } | { store: typeof stores.$inferSelect }> {
  if (!isValidTaxRate(input.taxRate)) return { error: "invalid_tax_rate" };
  if (!isValidWhatsAppNumber(input.whatsappNumber)) return { error: "invalid_whatsapp_number" };

  const normalizedStoreCode = typeof input.storeCode === "string" ? input.storeCode.toUpperCase() : input.storeCode;
  if (!isValidStoreCode(normalizedStoreCode)) return { error: "invalid_store_code" };

  const existingCode = await db.select().from(stores).where(eq(stores.storeCode, normalizedStoreCode)).limit(1);
  if (existingCode.length > 0) return { error: "store_code_already_registered" };

  const [store] = await db
    .insert(stores)
    .values({
      name: input.name,
      storeCode: normalizedStoreCode,
      address: input.address,
      primaryContact: input.primaryContact,
      whatsappNumber: input.whatsappNumber,
      taxRate: input.taxRate.toFixed(2),
      // contracts/admin-console-api.md + quickstart.md Scenario 2: always created
      // inactive, regardless of whether whatsappNumber already validates — activation
      // is always its own explicit step.
      active: false,
    })
    .returning();

  return { store };
}

export async function updateStore(
  id: string,
  patch: {
    name?: string;
    address?: string;
    primaryContact?: string;
    whatsappNumber?: string;
    taxRate?: number;
    active?: boolean;
  },
): Promise<{ error: StoreError } | { store: typeof stores.$inferSelect }> {
  const existingRows = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) return { error: "not_found" };

  if (patch.taxRate !== undefined && !isValidTaxRate(patch.taxRate)) {
    return { error: "invalid_tax_rate" };
  }
  if (patch.whatsappNumber !== undefined && !isValidWhatsAppNumber(patch.whatsappNumber)) {
    return { error: "invalid_whatsapp_number" };
  }

  // FR-007: activation is gated on the RESULTING number (this patch's own update, if any,
  // else whatever's already on file) being present and well-formed.
  if (patch.active === true) {
    const resultingWhatsappNumber = patch.whatsappNumber ?? existing.whatsappNumber;
    if (!isValidWhatsAppNumber(resultingWhatsappNumber)) {
      return { error: "whatsapp_number_required_to_activate" };
    }
  }

  const [updated] = await db
    .update(stores)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.address !== undefined ? { address: patch.address } : {}),
      ...(patch.primaryContact !== undefined ? { primaryContact: patch.primaryContact } : {}),
      ...(patch.whatsappNumber !== undefined ? { whatsappNumber: patch.whatsappNumber } : {}),
      ...(patch.taxRate !== undefined ? { taxRate: patch.taxRate.toFixed(2) } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(stores.id, id))
    .returning();

  return { store: updated };
}

export async function listStores() {
  return db.select().from(stores);
}
