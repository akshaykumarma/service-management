import { NextRequest, NextResponse } from "next/server";
import { getDemoTicketIdForInvoiceToken, getTicketIdForInvoiceToken } from "@/lib/billing/invoice";
import { renderDemoInvoicePdf, renderInvoicePdf } from "@/lib/billing/invoice-pdf";

/**
 * Public, unauthenticated — this is the link sent to the CUSTOMER via WhatsApp at
 * delivery (post-005 product feedback), so it deliberately doesn't go through
 * requireAuthenticatedSession like every other route in this app. See
 * lib/db/schema.ts's ticketInvoices for why the token itself doesn't need to be a
 * one-way hash. `inline`, not `attachment`, so it opens straight in a mobile browser's
 * PDF viewer when tapped from WhatsApp, unlike this app's staff-facing exports.
 */
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  // A service ticket's invoice, or (post-008) a completed demo ticket's.
  const ticketId = await getTicketIdForInvoiceToken(params.token);
  const demoTicketId = ticketId ? null : await getDemoTicketIdForInvoiceToken(params.token);
  if (!ticketId && !demoTicketId) {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }

  const pdfBuffer = ticketId ? await renderInvoicePdf(ticketId) : await renderDemoInvoicePdf(demoTicketId!);
  if (!pdfBuffer) {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="invoice.pdf"',
    },
  });
}
