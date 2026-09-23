import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { ticketInvoices } from "@/lib/db/schema";

/**
 * One token per ticket, minted once and reused for the lifetime of the ticket — see
 * schema.ts's ticketInvoices for why it's stable and stored in plaintext.
 */
export async function getOrCreateInvoiceToken(ticketId: string): Promise<string> {
  const existing = await db.select().from(ticketInvoices).where(eq(ticketInvoices.ticketId, ticketId)).limit(1);
  if (existing[0]) return existing[0].token;

  const token = randomBytes(24).toString("base64url");
  const [row] = await db.insert(ticketInvoices).values({ ticketId, token }).returning();
  return row.token;
}

export async function getTicketIdForInvoiceToken(token: string): Promise<string | null> {
  const rows = await db
    .select({ ticketId: ticketInvoices.ticketId })
    .from(ticketInvoices)
    .where(eq(ticketInvoices.token, token))
    .limit(1);
  return rows[0]?.ticketId ?? null;
}
