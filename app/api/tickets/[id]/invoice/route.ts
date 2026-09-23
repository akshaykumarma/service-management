import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { assertTicketAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { renderInvoicePdf } from "@/lib/billing/invoice-pdf";

/**
 * The staff-facing equivalent of the public /api/invoices/:token link — lets a Service
 * Manager/Admin/Technician view or download the same PDF for a ticket they already have
 * access to, without needing the customer's WhatsApp link (post-005 product feedback).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const rows = await db.select().from(tickets).where(eq(tickets.id, params.id)).limit(1);
  const ticket = rows[0];
  if (!ticket) {
    return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
  }

  try {
    await assertTicketAccess(caller, ticket);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
    }
    throw err;
  }

  const pdfBuffer = await renderInvoicePdf(ticket.id);
  if (!pdfBuffer) {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="invoice.pdf"',
    },
  });
}
