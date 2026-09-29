import { existsSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { statusHistory, stores, tickets, ticketLineItems, users } from "@/lib/db/schema";
import { calculateBill } from "@/lib/billing/bill-calculation";
import { formatDate } from "@/lib/format/date";

const BRAND_NAME = "Shubha Sewing";
const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

// app/globals.css's own brand tokens, so the invoice matches the app.
const COLOR = {
  primary: "#c81e1e",
  primaryLight: "#fbeaea",
  text: "#18181b",
  dim: "#52525b",
  muted: "#71717a",
  border: "#e4e4e7",
  zebra: "#fafafa",
  white: "#ffffff",
};

const MARGIN = 48;
const FOOTER_HEIGHT = 90;
const ROW_PADDING = 8;

/** Same pdfkit pattern as lib/reporting/pdf-export.ts. */
function collectPdf(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // A4 (the stores are in India); margin 0 because every element is placed
    // explicitly, so pdfkit never auto-paginates behind our back.
    const doc = new PDFDocument({ size: "A4", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

/** The standard PDF fonts have no ₹ glyph, hence "Rs.". */
function money(value: number): string {
  return `Rs. ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface InvoiceData {
  ticketNumber: string;
  receivedAt: Date;
  deliveredAt: Date;
  customerName: string;
  customerPhone: string;
  machineModel: string;
  serialNumber: string | null;
  issueDescription: string;
  technicianName: string | null;
  store: { name: string; address: string | null; whatsappNumber: string | null };
  lineItems: { name: string; type: string; quantity: number; unitCost: number; lineTotal: number }[];
  taxRate: number;
  bill: { subtotal: number; taxAmount: number; total: number };
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
  const lineItems = await db
    .select()
    .from(ticketLineItems)
    .where(eq(ticketLineItems.ticketId, ticketId))
    .orderBy(ticketLineItems.createdAt);
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

  const data: InvoiceData = {
    ticketNumber: ticket.ticketNumber,
    receivedAt: ticket.createdAt,
    deliveredAt: deliveredRow?.createdAt ?? ticket.updatedAt,
    customerName: ticket.customerName,
    customerPhone: ticket.customerPhone,
    machineModel: ticket.machineModel,
    serialNumber: ticket.serialNumber,
    issueDescription: ticket.issueDescription,
    technicianName: technicianRows[0]?.name ?? null,
    store: { name: store?.name ?? BRAND_NAME, address: store?.address ?? null, whatsappNumber: store?.whatsappNumber ?? null },
    lineItems: lineItems.map((li) => ({
      name: li.nameSnapshot,
      type: li.itemType === "part" ? "Part" : "Service",
      quantity: li.quantity,
      unitCost: Number(li.unitCostSnapshot),
      lineTotal: Number(li.lineTotal),
    })),
    taxRate: Number(ticket.taxRate),
    bill,
  };

  return collectPdf((doc) => drawInvoice(doc, data));
}

function drawInvoice(doc: PDFKit.PDFDocument, data: InvoiceData): void {
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - 2 * MARGIN;
  const contentBottom = doc.page.height - FOOTER_HEIGHT - 16;

  const drawPageChrome = () => {
    const h = doc.page.height;
    doc.rect(0, 0, pageWidth, 6).fill(COLOR.primary);
    doc.rect(0, h - 6, pageWidth, 6).fill(COLOR.primary);

    const footerTop = h - FOOTER_HEIGHT;
    doc.moveTo(MARGIN, footerTop).lineTo(pageWidth - MARGIN, footerTop).lineWidth(1).strokeColor(COLOR.border).stroke();
    doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(11)
      .text(`Thank you for choosing ${BRAND_NAME}!`, MARGIN, footerTop + 14, { width: contentWidth, align: "center" });
    const contact = [data.store.name, data.store.address, data.store.whatsappNumber && `WhatsApp ${data.store.whatsappNumber}`]
      .filter(Boolean)
      .join("  ·  ");
    doc.fillColor(COLOR.muted).font("Helvetica").fontSize(8.5)
      .text(contact, MARGIN, footerTop + 32, { width: contentWidth, align: "center", lineBreak: false, ellipsis: true })
      .text("This is a computer-generated invoice and does not require a signature.", MARGIN, footerTop + 46, {
        width: contentWidth,
        align: "center",
      });
  };

  const newPage = (): number => {
    doc.addPage({ size: "A4", margin: 0 });
    drawPageChrome();
    doc.fillColor(COLOR.muted).font("Helvetica").fontSize(9)
      .text(`Invoice ${data.ticketNumber} (continued)`, MARGIN, 24, { width: contentWidth, align: "right" });
    return MARGIN;
  };

  drawPageChrome();

  // Header: logo left, INVOICE + meta right.
  if (existsSync(LOGO_PATH)) doc.image(LOGO_PATH, MARGIN, 30, { width: 150 });
  doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(26)
    .text("INVOICE", MARGIN, 36, { width: contentWidth, align: "right", characterSpacing: 2 });
  let y = 72;
  for (const [label, value] of [
    ["Invoice no.", data.ticketNumber],
    ["Received", formatDate(data.receivedAt)],
    ["Delivered", formatDate(data.deliveredAt)],
  ]) {
    doc.fillColor(COLOR.muted).font("Helvetica").fontSize(9.5).text(label, MARGIN, y, { width: contentWidth - 100, align: "right" });
    doc.fillColor(COLOR.text).font("Helvetica-Bold").text(value, MARGIN, y, { width: contentWidth, align: "right" });
    y += 14;
  }

  y = 128;
  doc.moveTo(MARGIN, y).lineTo(pageWidth - MARGIN, y).lineWidth(1).strokeColor(COLOR.border).stroke();

  // Billed to / From.
  y += 16;
  const colWidth = (contentWidth - 24) / 2;
  const infoBlock = (x: number, title: string, lines: string[]): number => {
    doc.fillColor(COLOR.primary).font("Helvetica-Bold").fontSize(8).text(title.toUpperCase(), x, y, { characterSpacing: 1 });
    let lineY = y + 14;
    lines.forEach((line, i) => {
      doc.fillColor(i === 0 ? COLOR.text : COLOR.dim).font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(i === 0 ? 11 : 9.5)
        .text(line, x, lineY, { width: colWidth });
      lineY = doc.y + 2;
    });
    return lineY;
  };
  const billedToBottom = infoBlock(MARGIN, "Billed to", [data.customerName, data.customerPhone]);
  const fromLines = [data.store.name, data.store.address, data.store.whatsappNumber && `WhatsApp: ${data.store.whatsappNumber}`];
  const fromBottom = infoBlock(MARGIN + colWidth + 24, "From", fromLines.filter((l): l is string => Boolean(l)));
  y = Math.max(billedToBottom, fromBottom) + 14;

  // Machine card.
  const cells: [string, string][] = [
    ["Machine", data.machineModel],
    ["Serial no.", data.serialNumber ?? "—"],
    ["Technician", data.technicianName ?? "—"],
  ];
  const cellWidth = contentWidth / 3;
  const issueText = `Issue: ${data.issueDescription}`;
  doc.font("Helvetica-Bold").fontSize(10);
  const cellValueHeight = Math.max(...cells.map(([, v]) => doc.heightOfString(v, { width: cellWidth - 20 })));
  doc.font("Helvetica-Oblique").fontSize(9);
  const issueHeight = doc.heightOfString(issueText, { width: contentWidth - 28 });
  const cardHeight = 22 + cellValueHeight + 8 + issueHeight + 12;
  doc.roundedRect(MARGIN, y, contentWidth, cardHeight, 6).fill(COLOR.primaryLight);
  cells.forEach(([label, value], i) => {
    const x = MARGIN + 14 + i * cellWidth;
    doc.fillColor(COLOR.muted).font("Helvetica").fontSize(8).text(label.toUpperCase(), x, y + 10, { characterSpacing: 0.8 });
    doc.fillColor(COLOR.text).font("Helvetica-Bold").fontSize(10).text(value, x, y + 22, { width: cellWidth - 20 });
  });
  doc.fillColor(COLOR.dim).font("Helvetica-Oblique").fontSize(9)
    .text(issueText, MARGIN + 14, y + 22 + cellValueHeight + 8, { width: contentWidth - 28 });
  y += cardHeight + 22;

  // Line items table.
  const columns = [
    { header: "#", width: 28, align: "left" as const },
    { header: "Description", width: contentWidth - 28 - 60 - 40 - 80 - 90, align: "left" as const },
    { header: "Type", width: 60, align: "left" as const },
    { header: "Qty", width: 40, align: "right" as const },
    { header: "Rate", width: 80, align: "right" as const },
    { header: "Amount", width: 90, align: "right" as const },
  ];
  const drawRow = (values: string[], rowY: number, opts: { color?: string; bold?: boolean; size?: number } = {}) => {
    let x = MARGIN;
    values.forEach((value, i) => {
      const col = columns[i];
      doc.fillColor(opts.color ?? COLOR.text).font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.size ?? 9.5)
        .text(value, x + ROW_PADDING, rowY, { width: col.width - 2 * ROW_PADDING, align: col.align });
      x += col.width;
    });
  };
  const drawTableHeader = () => {
    doc.rect(MARGIN, y, contentWidth, 24).fill(COLOR.text);
    drawRow(columns.map((c) => c.header.toUpperCase()), y + 8, { color: COLOR.white, bold: true, size: 8 });
    y += 24;
  };

  drawTableHeader();
  if (data.lineItems.length === 0) {
    doc.fillColor(COLOR.muted).font("Helvetica-Oblique").fontSize(9.5)
      .text("No parts or services billed.", MARGIN + ROW_PADDING, y + ROW_PADDING, { width: contentWidth - 2 * ROW_PADDING });
    y += 24;
  }
  data.lineItems.forEach((item, i) => {
    doc.font("Helvetica").fontSize(9.5);
    const rowHeight = Math.max(24, doc.heightOfString(item.name, { width: columns[1].width - 2 * ROW_PADDING }) + 2 * ROW_PADDING);
    if (y + rowHeight > contentBottom) {
      y = newPage();
      drawTableHeader();
    }
    if (i % 2 === 1) doc.rect(MARGIN, y, contentWidth, rowHeight).fill(COLOR.zebra);
    drawRow([String(i + 1), item.name, item.type, String(item.quantity), money(item.unitCost), money(item.lineTotal)], y + ROW_PADDING);
    y += rowHeight;
  });
  doc.moveTo(MARGIN, y).lineTo(pageWidth - MARGIN, y).lineWidth(1).strokeColor(COLOR.border).stroke();

  // Totals.
  const totalsHeight = 14 + 18 * 2 + 4 + 34;
  if (y + totalsHeight > contentBottom) y = newPage();
  y += 14;
  const totalsWidth = 220;
  const totalsX = pageWidth - MARGIN - totalsWidth;
  const totalLine = (label: string, value: string) => {
    doc.fillColor(COLOR.dim).font("Helvetica").fontSize(10).text(label, totalsX + 12, y, { width: 110 });
    doc.fillColor(COLOR.text).font("Helvetica").text(value, totalsX, y, { width: totalsWidth - 12, align: "right" });
    y += 18;
  };
  totalLine("Subtotal", money(data.bill.subtotal));
  totalLine(`Tax (${data.taxRate}%)`, money(data.bill.taxAmount));
  y += 4;
  doc.roundedRect(totalsX, y, totalsWidth, 34, 6).fill(COLOR.primary);
  doc.fillColor(COLOR.white).font("Helvetica-Bold").fontSize(11).text("TOTAL", totalsX + 12, y + 11, { characterSpacing: 1 });
  doc.fontSize(14).text(money(data.bill.total), totalsX, y + 9, { width: totalsWidth - 12, align: "right" });
}
