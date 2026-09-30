import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as exportGET } from "@/app/api/reports/export/route";
import { db } from "@/lib/db/client";
import { ticketLineItems } from "@/lib/db/schema";

async function setup() {
  const store = await createStore("Balepet");
  const otherStore = await createStore("Hebbal");
  const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
  const otherSm = await createUser({ role: "service_manager", storeIds: [otherStore.id] });
  const own = await createTicket({ storeId: store.id, createdBy: sm.id, status: "delivered", customerName: "Nandini S" });
  await db.insert(ticketLineItems).values({
    ticketId: own.id,
    itemType: "service",
    itemId: randomUUID(),
    nameSnapshot: "Annual service",
    quantity: 1,
    unitCostSnapshot: "650.00",
    lineTotal: "650.00",
  });
  const foreign = await createTicket({ storeId: otherStore.id, createdBy: otherSm.id, status: "open" });
  const cookie = await loginAs(sm.email, "Correct123!");
  const get = (qs: string) => exportGET(jsonRequest(`/api/reports/export?type=details&${qs}`, { cookie }));
  return { own, foreign, get };
}

describe("Reports ticket-details export (post-v1 product feedback)", () => {
  beforeEach(resetDb);

  it("exports a real Excel workbook with the table's columns, the caller's store only, and a totals row", async () => {
    const { own, foreign, get } = await setup();
    const res = await get("format=xlsx");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toMatch(/tickets-report-\d{4}-\d{2}-\d{2}\.xlsx/);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await res.arrayBuffer());
    const sheet = workbook.getWorksheet("Tickets")!;
    expect(sheet.getRow(1).getCell(1).value).toBe("Ticket #");
    const ticketNumbers = sheet.getColumn(1).values.slice(2).map(String);
    expect(ticketNumbers).toContain(own.ticketNumber);
    expect(ticketNumbers).not.toContain(foreign.ticketNumber);
    const last = sheet.getRow(sheet.rowCount);
    expect(last.getCell(1).value).toBe("Total");
    expect(last.getCell(10).value).toBe(650);
  });

  it("exports CSV with the same columns and scope", async () => {
    const { own, foreign, get } = await setup();
    const res = await get("format=csv");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Ticket #,Store,Customer");
    expect(text).toContain(own.ticketNumber);
    expect(text).toContain("Nandini S");
    expect(text).not.toContain(foreign.ticketNumber);
    expect(text.trim().split("\n").pop()).toMatch(/^Total,.*650\.00/);
  });

  it("exports a PDF", async () => {
    const { get } = await setup();
    const res = await get("format=pdf&dateFrom=2026-01-01");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).toString("latin1").startsWith("%PDF-")).toBe(true);
  });

  it("applies the same filters as the table", async () => {
    const { own, get } = await setup();
    const res = await get("format=csv&status=open");
    const text = await res.text();
    expect(text).not.toContain(own.ticketNumber);
  });

  it("rejects an unknown format", async () => {
    const { get } = await setup();
    expect((await get("format=docx")).status).toBe(400);
  });
});
