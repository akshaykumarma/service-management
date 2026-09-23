import PDFDocument from "pdfkit";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { statusHistory, stores, tickets, ticketLineItems, users } from "@/lib/db/schema";
import { calculateBill } from "@/lib/billing/bill-calculation";
import { formatDate } from "@/lib/format/date";

/** Same pdfkit pattern as lib/reporting/pdf-export.ts. */
function collectPdf(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

/**
 * Generated live from the ticket's current data, never cached — safe to do so because
 * the bill is already locked by the time a ticket reaches Delivered
 * (lib/billing/line-items.ts's checkTicketWritable), so nothing here can change after
 * the fact. Returns null if the ticket doesn't exist.
 */
export async function renderInvoicePdf(ticketId: string): Promise<Buffer | null> {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket) return null;

  const [store] = await db.select().from(stores).where(eq(stores.id, ticket.storeId)).limit(1);
  const lineItems = await db.select().from(ticketLineItems).where(eq(ticketLineItems.ticketId, ticketId));
  const bill = await calculateBill(ticketId);
  const technicianRows = ticket.assignedTechnicianId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, ticket.assignedTechnicianId)).limit(1)
    : [];
  const [deliveredRow] = await db
    .select({ createdAt: statusHistory.createdAt })
    .from(statusHistory)
    .where(and(eq(statusHistory.ticketId, ticketId), eq(statusHistory.toStatus, "delivered")))
    .orderBy(desc(statusHistory.createdAt))
    .limit(1);
  const deliveredAt = deliveredRow?.createdAt ?? ticket.updatedAt;

  return collectPdf((doc) => {
    doc.fontSize(18).text("Invoice", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    if (store?.name) doc.text(store.name);
    if (store?.address) doc.text(store.address);
    if (store?.whatsappNumber) doc.text(store.whatsappNumber);
    doc.moveDown();

    doc.fontSize(12).text(`Ticket: ${ticket.ticketNumber}`);
    doc.fontSize(10);
    doc.text(`Customer: ${ticket.customerName}`);
    doc.text(`Phone: ${ticket.customerPhone}`);
    doc.text(`Machine model: ${ticket.machineModel}`);
    doc.text(`Issue: ${ticket.issueDescription}`);
    if (technicianRows[0]) doc.text(`Technician: ${technicianRows[0].name}`);
    doc.text(`Delivered: ${formatDate(deliveredAt)}`);
    doc.moveDown();

    doc.fontSize(12).text("Parts & Services", { underline: true });
    doc.fontSize(10);
    if (lineItems.length === 0) {
      doc.text("No parts or services billed.");
    } else {
      for (const li of lineItems) {
        doc.text(
          `${li.nameSnapshot}  x${li.quantity}  @ ${Number(li.unitCostSnapshot).toFixed(2)}  = ${Number(li.lineTotal).toFixed(2)}`,
        );
      }
    }
    doc.moveDown();

    doc.fontSize(11);
    doc.text(`Subtotal: ${bill.subtotal.toFixed(2)}`);
    doc.text(`Tax (${Number(ticket.taxRate)}%): ${bill.taxAmount.toFixed(2)}`);
    doc.moveDown(0.3);
    doc.fontSize(13).text(`Total: ${bill.total.toFixed(2)}`, { underline: true });
  });
}
