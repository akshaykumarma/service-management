import { existsSync } from "fs";
import path from "path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { stringify } from "csv-stringify/sync";
import type { TicketDetailRow } from "@/lib/reporting/ticket-details";
import { formatDate } from "@/lib/format/date";

/**
 * Exports of the Reports page's ticket-details table (post-v1 product feedback: the page
 * had no export buttons). All three formats carry exactly the rows and columns the table
 * shows for the same filters, plus a totals row.
 */

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const COLUMNS = [
  "Ticket #",
  "Store",
  "Customer",
  "Phone",
  "Machine model",
  "Status",
  "Created",
  "Est. delivery date",
  "Technician",
  "Subtotal",
  "Tax",
  "Total",
] as const;

function rowValues(t: TicketDetailRow): (string | number)[] {
  return [
    t.ticketNumber,
    t.storeName,
    t.customerName,
    t.customerPhone,
    t.machineModel,
    STATUS_LABELS[t.status] ?? t.status,
    formatDate(t.createdAt),
    t.estimatedPickupDate ? formatDate(t.estimatedPickupDate) : "",
    t.technicianName ?? "",
    t.subtotal,
    t.taxAmount,
    t.total,
  ];
}

function totals(rows: TicketDetailRow[]) {
  const sum = (pick: (t: TicketDetailRow) => number) => Number(rows.reduce((a, t) => a + pick(t), 0).toFixed(2));
  return { subtotal: sum((t) => t.subtotal), taxAmount: sum((t) => t.taxAmount), total: sum((t) => t.total) };
}

export function exportFilename(ext: "csv" | "xlsx" | "pdf", now: Date = new Date()): string {
  return `tickets-report-${now.toISOString().slice(0, 10)}.${ext}`;
}

export function ticketDetailsToCsv(rows: TicketDetailRow[]): string {
  const t = totals(rows);
  const body = rows.map((r) => rowValues(r).map((v) => (typeof v === "number" ? v.toFixed(2) : v)));
  const totalRow = ["Total", "", "", "", "", "", "", "", "", t.subtotal.toFixed(2), t.taxAmount.toFixed(2), t.total.toFixed(2)];
  // A UTF-8 BOM so Excel opens names with non-ASCII characters correctly.
  return "﻿" + stringify([[...COLUMNS], ...body, totalRow]);
}

export async function ticketDetailsToXlsx(rows: TicketDetailRow[], meta: { title: string }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Shubha Sewing Service Desk";
  const sheet = workbook.addWorksheet("Tickets", { views: [{ state: "frozen", ySplit: 1 }] });

  sheet.columns = COLUMNS.map((header, i) => ({
    header,
    key: `c${i}`,
    width: [16, 24, 22, 16, 26, 13, 12, 16, 18, 12, 11, 12][i],
  }));
  for (const r of rows) sheet.addRow(rowValues(r));

  const t = totals(rows);
  const totalRow = sheet.addRow(["Total", "", "", "", "", "", "", "", "", t.subtotal, t.taxAmount, t.total]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin" } };
  });

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;

  for (const col of [10, 11, 12]) {
    sheet.getColumn(col).numFmt = '"₹"#,##0.00';
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: COLUMNS.length } };
  workbook.title = meta.title;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const BRAND_FONTS = {
  regular: path.join(FONT_DIR, "PlusJakartaSans-Regular.ttf"),
  bold: path.join(FONT_DIR, "PlusJakartaSans-Bold.ttf"),
};

/** A4 landscape table — the same font as the invoice (lib/billing/invoice-pdf.ts) so ₹ renders. */
export function ticketDetailsToPdf(rows: TicketDetailRow[], meta: { title: string; subtitle: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const brandFonts = Object.values(BRAND_FONTS).every((f) => existsSync(f));
    doc.registerFont("Body", brandFonts ? BRAND_FONTS.regular : "Helvetica");
    doc.registerFont("Body-Bold", brandFonts ? BRAND_FONTS.bold : "Helvetica-Bold");
    const money = (n: number) =>
      `${brandFonts ? "₹" : "Rs. "}${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const M = 30;
    const pageW = doc.page.width;
    const pageBottom = doc.page.height - 36;
    const widths = [88, 72, 74, 70, 82, 54, 60, 70, 62, 56, 50, 60];
    const scale = (pageW - 2 * M) / widths.reduce((a, b) => a + b, 0);
    const colW = widths.map((w) => w * scale);
    const numeric = (i: number) => i >= 9;
    const fontSize = 7.5;

    let y = M;
    doc.fillColor("#c81e1e").font("Body-Bold").fontSize(15).text(meta.title, M, y);
    doc.fillColor("#52525b").font("Body").fontSize(9).text(meta.subtitle, M, y + 20);
    y += 42;

    const drawHeader = () => {
      doc.rect(M, y, pageW - 2 * M, 18).fill("#18181b");
      let x = M;
      COLUMNS.forEach((column, i) => {
        const h = column === "Est. delivery date" ? "Est. delivery" : column;
        doc.fillColor("#ffffff").font("Body-Bold").fontSize(fontSize)
          .text(h, x + 4, y + 5, { width: colW[i] - 8, align: numeric(i) ? "right" : "left", lineBreak: false, ellipsis: true });
        x += colW[i];
      });
      y += 18;
    };

    const drawRow = (values: (string | number)[], opts: { bold?: boolean; shade?: boolean } = {}) => {
      const cells = values.map((v, i) => (numeric(i) && typeof v === "number" ? money(v) : String(v)));
      doc.font(opts.bold ? "Body-Bold" : "Body").fontSize(fontSize);
      const h = Math.max(16, ...cells.map((c, i) => doc.heightOfString(c, { width: colW[i] - 8 }) + 8));
      if (y + h > pageBottom) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
        y = M;
        drawHeader();
      }
      if (opts.shade) doc.rect(M, y, pageW - 2 * M, h).fill("#fafafa");
      let x = M;
      cells.forEach((c, i) => {
        doc.fillColor("#18181b").font(opts.bold ? "Body-Bold" : "Body").fontSize(fontSize)
          .text(c, x + 4, y + 4, { width: colW[i] - 8, align: numeric(i) ? "right" : "left" });
        x += colW[i];
      });
      y += h;
    };

    drawHeader();
    if (rows.length === 0) {
      doc.fillColor("#71717a").font("Body").fontSize(9).text("No tickets match these filters.", M + 4, y + 6);
    } else {
      rows.forEach((r, i) =>
        drawRow(
          rowValues(r).map((v, col) => ((col === 7 || col === 8) && v === "" ? "—" : v)),
          { shade: i % 2 === 1 },
        ),
      );
      const t = totals(rows);
      doc.moveTo(M, y).lineTo(pageW - M, y).strokeColor("#a1a1aa").lineWidth(0.8).stroke();
      drawRow(["Total", "", "", "", "", "", "", "", "", t.subtotal, t.taxAmount, t.total], { bold: true });
    }

    doc.end();
  });
}
