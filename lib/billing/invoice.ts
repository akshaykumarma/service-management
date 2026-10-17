import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoTicketInvoices, ticketInvoices } from "@/lib/db/schema";

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

/** Demo tickets' equivalent of getOrCreateInvoiceToken (demo_ticket_invoices). */
export async function getOrCreateDemoInvoiceToken(demoTicketId: string): Promise<string> {
  const existing = await db
    .select()
    .from(demoTicketInvoices)
    .where(eq(demoTicketInvoices.demoTicketId, demoTicketId))
    .limit(1);
  if (existing[0]) return existing[0].token;

  const token = randomBytes(24).toString("base64url");
  const [row] = await db.insert(demoTicketInvoices).values({ demoTicketId, token }).returning();
  return row.token;
}

export async function getDemoTicketIdForInvoiceToken(token: string): Promise<string | null> {
  const rows = await db
    .select({ demoTicketId: demoTicketInvoices.demoTicketId })
    .from(demoTicketInvoices)
    .where(eq(demoTicketInvoices.token, token))
    .limit(1);
  return rows[0]?.demoTicketId ?? null;
}

/** The customer-facing link for an invoice token (APP_BASE_URL is the app's public address). */
export function invoiceUrlFor(token: string): string {
  return `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/api/invoices/${token}`;
}
