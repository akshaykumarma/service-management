import PDFDocument from "pdfkit";
import type { TicketCard } from "@/lib/board/card-shape";
import type { SummaryReport } from "@/lib/reporting/summary";

/** `pdfkit`: programmatic, imperative PDF construction — no headless browser (research.md §5). */
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

/** List export: same content as ticketListToCsv, rendered as a PDF instead. */
export function ticketListToPdf(tickets: TicketCard[]): Promise<Buffer> {
  return collectPdf((doc) => {
    doc.fontSize(16).text("Ticket List", { underline: true });
    doc.moveDown();
    doc.fontSize(10);
    if (tickets.length === 0) {
      doc.text("No tickets match the current filters.");
      return;
    }
    for (const t of tickets) {
      doc.text(
        `${t.ticketNumber} — ${t.customerName} — ${t.machineModel} — ${t.status} — created ${t.createdAt
          .toISOString()
          .slice(0, 10)} — ${t.daysOpen} day(s) open`,
      );
    }
  });
}

/** Summary export: same content as summaryToCsv, rendered as a PDF instead. */
export function summaryToPdf(summary: SummaryReport): Promise<Buffer> {
  return collectPdf((doc) => {
    doc.fontSize(16).text("Summary Report", { underline: true });
    doc.moveDown();
    doc.fontSize(12).text(`Total tickets: ${summary.totalTickets}`);
    doc.moveDown(0.5);
    doc.text("By status:");
    for (const [status, count] of Object.entries(summary.byStatus)) {
      doc.text(`  ${status}: ${count}`);
    }
    doc.moveDown(0.5);
    doc.text(`Average resolution time: ${summary.avgResolutionTimeHours.toFixed(2)} hours`);
    doc.text(`Parts revenue: ${summary.partsRevenue.toFixed(2)}`);
    doc.text(`Services revenue: ${summary.servicesRevenue.toFixed(2)}`);
  });
}
