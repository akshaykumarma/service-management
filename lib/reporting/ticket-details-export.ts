import { existsSync } from "fs";
import path from "path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { stringify } from "csv-stringify/sync";
import type { TicketDetailRow } from "@/lib/reporting/ticket-details";
import type { DemoTicketDetailRow } from "@/lib/reporting/demo-ticket-details";
import { formatDate } from "@/lib/format/date";

/**
 * Exports of the Reports page's tables (service tickets, and demo tickets since
 * 008-demo-board). Each format carries exactly the rows and columns the table shows for
 * the same filters, plus a totals row. A report is described once as a `ReportTable`;
 * the CSV, Excel and PDF writers below render any such table.
 */

type Cell = string | number;

interface ReportColumn {
  header: string;
  /** Shorter header for the PDF's narrow columns. */
  pdfHeader?: string;
  /** Excel column width (characters). */
  width: number;
  /** Relative PDF column width. */
  pdfWidth: number;
  /** Rupee amount: right-aligned, ₹-formatted in Excel/PDF, 2 decimals in CSV. */
  money?: boolean;
  /** Shown as "—" in the PDF when empty. */
  dashWhenEmpty?: boolean;
}

export interface ReportTable {
  sheetName: string;
  emptyMessage: string;
  columns: ReportColumn[];
  rows: Cell[][];
  totals: Cell[];
}

const SERVICE_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const DEMO_STATUS_LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const sum = (values: number[]) => Number(values.reduce((a, v) => a + v, 0).toFixed(2));

export function serviceTicketsTable(rows: TicketDetailRow[]): ReportTable {
  return {
    sheetName: "Tickets",
    emptyMessage: "No tickets match these filters.",
    columns: [
      { header: "Ticket #", width: 16, pdfWidth: 88 },
      { header: "Store", width: 24, pdfWidth: 72 },
      { header: "Customer", width: 22, pdfWidth: 74 },
      { header: "Phone", width: 16, pdfWidth: 70 },
      { header: "Machine model", width: 26, pdfWidth: 82 },
      { header: "Status", width: 13, pdfWidth: 54 },
      { header: "Created", width: 12, pdfWidth: 60 },
      { header: "Est. delivery date", pdfHeader: "Est. delivery", width: 16, pdfWidth: 70, dashWhenEmpty: true },
      { header: "Technician", width: 18, pdfWidth: 62, dashWhenEmpty: true },
      { header: "Subtotal", width: 12, pdfWidth: 56, money: true },
      { header: "Tax", width: 11, pdfWidth: 50, money: true },
      { header: "Total", width: 12, pdfWidth: 60, money: true },
    ],
    rows: rows.map((t) => [
      t.ticketNumber,
      t.storeName,
      t.customerName,
      t.customerPhone,
      t.machineModel,
      SERVICE_STATUS_LABELS[t.status] ?? t.status,
      formatDate(t.createdAt),
      t.estimatedPickupDate ? formatDate(t.estimatedPickupDate) : "",
      t.technicianName ?? "",
      t.subtotal,
      t.taxAmount,
      t.total,
    ]),
    totals: [
      "Total", "", "", "", "", "", "", "", "",
      sum(rows.map((t) => t.subtotal)),
      sum(rows.map((t) => t.taxAmount)),
      sum(rows.map((t) => t.total)),
    ],
  };
}

export function demoTicketsTable(rows: DemoTicketDetailRow[]): ReportTable {
  return {
    sheetName: "Demo tickets",
    emptyMessage: "No demo tickets match these filters.",
    columns: [
      { header: "Ticket #", width: 20, pdfWidth: 112 },
      { header: "Store", width: 22, pdfWidth: 54 },
      { header: "Customer", width: 20, pdfWidth: 62 },
      { header: "Phone", width: 16, pdfWidth: 80 },
      { header: "Model", width: 22, pdfWidth: 58 },
      { header: "Serial number", pdfHeader: "Serial no.", width: 18, pdfWidth: 60 },
      { header: "Invoice number", pdfHeader: "Invoice no.", width: 18, pdfWidth: 60 },
      { header: "Demo service", pdfHeader: "Service", width: 22, pdfWidth: 58 },
      { header: "Demo date", width: 12, pdfWidth: 62 },
      { header: "Status", width: 12, pdfWidth: 54 },
      { header: "Received", width: 12, pdfWidth: 62 },
      { header: "Technician", width: 18, pdfWidth: 54, dashWhenEmpty: true },
      { header: "Price", width: 12, pdfWidth: 52, money: true },
    ],
    rows: rows.map((t) => [
      t.ticketNumber,
      t.storeName,
      t.customerName,
      t.customerPhone,
      t.machineModel,
      t.serialNumber,
      t.invoiceNumber,
      t.demoServiceName,
      formatDate(t.demoDate),
      DEMO_STATUS_LABELS[t.status] ?? t.status,
      formatDate(t.createdAt),
      t.technicianName ?? "",
      t.demoServicePrice,
    ]),
    totals: [
      `Total (${rows.length} demo${rows.length === 1 ? "" : "s"})`, "", "", "", "", "", "", "", "", "", "", "",
      sum(rows.map((t) => t.demoServicePrice)),
    ],
  };
}

export function exportFilename(ext: "csv" | "xlsx" | "pdf", now: Date = new Date(), prefix = "tickets-report"): string {
  return `${prefix}-${now.toISOString().slice(0, 10)}.${ext}`;
}

export function reportTableToCsv(table: ReportTable): string {
  const asCsv = (row: Cell[]) => row.map((v, i) => (table.columns[i].money && typeof v === "number" ? v.toFixed(2) : v));
  // A UTF-8 BOM so Excel opens names with non-ASCII characters correctly.
  return "﻿" + stringify([table.columns.map((c) => c.header), ...table.rows.map(asCsv), asCsv(table.totals)]);
}

export async function reportTableToXlsx(table: ReportTable, meta: { title: string }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Shubha Sewing Service Desk";
  workbook.title = meta.title;
  const sheet = workbook.addWorksheet(table.sheetName, { views: [{ state: "frozen", ySplit: 1 }] });

  sheet.columns = table.columns.map((c, i) => ({ header: c.header, key: `c${i}`, width: c.width }));
  for (const row of table.rows) sheet.addRow(row);

  const totalRow = sheet.addRow(table.totals);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin" } };
  });

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;

  table.columns.forEach((c, i) => {
    if (c.money) sheet.getColumn(i + 1).numFmt = '"₹"#,##0.00';
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, table.rows.length + 1), column: table.columns.length },
  };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const BRAND_FONTS = {
  regular: path.join(FONT_DIR, "PlusJakartaSans-Regular.ttf"),
  bold: path.join(FONT_DIR, "PlusJakartaSans-Bold.ttf"),
};

/** A4 landscape table — the same font as the invoice (lib/billing/invoice-pdf.ts) so ₹ renders. */
export function reportTableToPdf(table: ReportTable, meta: { title: string; subtitle: string }): Promise<Buffer> {
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
    const scale = (pageW - 2 * M) / table.columns.reduce((a, c) => a + c.pdfWidth, 0);
    const colW = table.columns.map((c) => c.pdfWidth * scale);
    const fontSize = 7.5;

    let y = M;
    doc.fillColor("#c81e1e").font("Body-Bold").fontSize(15).text(meta.title, M, y);
    doc.fillColor("#52525b").font("Body").fontSize(9).text(meta.subtitle, M, y + 20);
    y += 42;

    const drawHeader = () => {
      doc.rect(M, y, pageW - 2 * M, 18).fill("#18181b");
      let x = M;
      table.columns.forEach((c, i) => {
        doc.fillColor("#ffffff").font("Body-Bold").fontSize(fontSize)
          .text(c.pdfHeader ?? c.header, x + 4, y + 5, { width: colW[i] - 8, align: c.money ? "right" : "left", lineBreak: false, ellipsis: true });
        x += colW[i];
      });
      y += 18;
    };

    const drawRow = (values: Cell[], opts: { bold?: boolean; shade?: boolean } = {}) => {
      const cells = values.map((v, i) => (table.columns[i].money && typeof v === "number" ? money(v) : String(v)));
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
          .text(c, x + 4, y + 4, { width: colW[i] - 8, align: table.columns[i].money ? "right" : "left" });
        x += colW[i];
      });
      y += h;
    };

    drawHeader();
    if (table.rows.length === 0) {
      doc.fillColor("#71717a").font("Body").fontSize(9).text(table.emptyMessage, M + 4, y + 6);
    } else {
      table.rows.forEach((row, i) =>
        drawRow(
          row.map((v, col) => (table.columns[col].dashWhenEmpty && v === "" ? "—" : v)),
          { shade: i % 2 === 1 },
        ),
      );
      doc.moveTo(M, y).lineTo(pageW - M, y).strokeColor("#a1a1aa").lineWidth(0.8).stroke();
      drawRow(table.totals, { bold: true });
    }

    doc.end();
  });
}

// Service-ticket entry points, unchanged in name and output.
export const ticketDetailsToCsv = (rows: TicketDetailRow[]) => reportTableToCsv(serviceTicketsTable(rows));
export const ticketDetailsToXlsx = (rows: TicketDetailRow[], meta: { title: string }) =>
  reportTableToXlsx(serviceTicketsTable(rows), meta);
export const ticketDetailsToPdf = (rows: TicketDetailRow[], meta: { title: string; subtitle: string }) =>
  reportTableToPdf(serviceTicketsTable(rows), meta);
