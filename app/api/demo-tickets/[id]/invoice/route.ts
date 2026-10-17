import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { loadAccessibleDemoTicket } from "@/lib/demo/route-helpers";
import { renderDemoInvoicePdf } from "@/lib/billing/invoice-pdf";

/**
 * Staff download of a completed demo ticket's invoice — the same PDF the customer gets a
 * link to on WhatsApp when the demo is completed. Only for Completed demos (before that
 * there is nothing to invoice), and only for a demo the caller may see.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const ticketOrResponse = await loadAccessibleDemoTicket(sessionOrResponse.user, params.id);
  if (ticketOrResponse instanceof NextResponse) return ticketOrResponse;
  if (ticketOrResponse.status !== "completed") {
    return NextResponse.json({ error: { code: "not_completed", message: "The demo isn't completed yet." } }, { status: 409 });
  }

  const pdfBuffer = await renderDemoInvoicePdf(ticketOrResponse.id);
  if (!pdfBuffer) {
    return NextResponse.json({ error: { code: "not_found" } }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="invoice-${ticketOrResponse.ticketNumber}.pdf"`,
    },
  });
}
