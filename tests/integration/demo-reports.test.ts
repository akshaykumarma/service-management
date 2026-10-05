import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createDemoService, createDemoTicket, createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as demoReportGET } from "@/app/api/reports/demo-tickets/route";
import { GET as serviceReportGET } from "@/app/api/reports/tickets/route";
import { GET as exportGET } from "@/app/api/reports/export/route";

async function setup() {
  const store = await createStore("Balepet");
  const other = await createStore("Hebbal");
  const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
  const otherSm = await createUser({ role: "service_manager", storeIds: [other.id] });
  const paid = await createDemoService({ name: "Embroidery demo", unitCost: "499.00" });
  const free = await createDemoService({ name: "Home demo", unitCost: "0.00" });
  const a = await createDemoTicket({ storeId: store.id, createdBy: sm.id, demoServiceId: paid.id, serialNumber: "SN-A", invoiceNumber: "INV-A" });
  const b = await createDemoTicket({ storeId: store.id, createdBy: sm.id, demoServiceId: free.id, status: "cancelled", serialNumber: "SN-B" });
  const foreign = await createDemoTicket({ storeId: other.id, createdBy: otherSm.id, demoServiceId: paid.id });
  const service = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open" });
  const cookie = await loginAs(sm.email, "Correct123!");
  return { store, sm, a, b, foreign, service, cookie };
}

const ids = async (res: Response) => (await res.json()).tickets.map((t: { id: string }) => t.id);

describe("demo tickets in Reports (post-008)", () => {
  beforeEach(resetDb);

  it("lists the caller's store's demo tickets (cancelled included), with serial/invoice/status filters", async () => {
    const { a, b, foreign, cookie } = await setup();
    const get = (qs = "") => demoReportGET(jsonRequest(`/api/reports/demo-tickets?${qs}`, { cookie }));

    const all = await ids(await get());
    expect(all.sort()).toEqual([a.id, b.id].sort());
    expect(all).not.toContain(foreign.id);

    expect(await ids(await get("status=cancelled"))).toEqual([b.id]);
    expect(await ids(await get("serialNumber=sn-a"))).toEqual([a.id]);
    expect(await ids(await get("invoiceNumber=INV-A"))).toEqual([a.id]);

    const [row] = (await (await get("serialNumber=SN-A")).json()).tickets;
    expect(row).toMatchObject({ demoServiceName: "Embroidery demo", demoServicePrice: 499, storeName: "Balepet", serialNumber: "SN-A" });
  });

  it("keeps demo and service reports separate", async () => {
    const { a, service, cookie } = await setup();
    const serviceIds = await ids(await serviceReportGET(jsonRequest("/api/reports/tickets", { cookie })));
    expect(serviceIds).toEqual([service.id]);
    expect(await ids(await demoReportGET(jsonRequest("/api/reports/demo-tickets", { cookie })))).not.toContain(service.id);
    expect(serviceIds).not.toContain(a.id);
  });

  it("refuses Technicians", async () => {
    const { store } = await setup();
    const tech = await createUser({ role: "technician", storeIds: [store.id], password: "Correct123!" });
    const res = await demoReportGET(jsonRequest("/api/reports/demo-tickets", { cookie: await loginAs(tech.email, "Correct123!") }));
    expect(res.status).toBe(403);
  });

  it("exports the demo table to Excel with demo columns and a count + price total", async () => {
    const { a, foreign, cookie } = await setup();
    const res = await exportGET(jsonRequest("/api/reports/export?type=demo-details&format=xlsx", { cookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/demo-tickets-report-\d{4}-\d{2}-\d{2}\.xlsx/);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await res.arrayBuffer());
    const sheet = workbook.getWorksheet("Demo tickets")!;
    const headers = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(expect.arrayContaining(["Serial number", "Invoice number", "Demo service", "Demo date", "Price"]));
    const numbers = sheet.getColumn(1).values.slice(2).map(String);
    expect(numbers).toContain(a.ticketNumber);
    expect(numbers).not.toContain(foreign.ticketNumber);
    const total = sheet.getRow(sheet.rowCount);
    expect(total.getCell(1).value).toBe("Total (2 demos)");
    expect(total.getCell(13).value).toBe(499);
  });

  it("exports CSV and PDF, and rejects other formats", async () => {
    const { a, cookie } = await setup();
    const get = (qs: string) => exportGET(jsonRequest(`/api/reports/export?type=demo-details&${qs}`, { cookie }));
    const csv = await (await get("format=csv&status=new")).text();
    expect(csv).toContain("Ticket #,Store,Customer,Phone,Model,Serial number,Invoice number");
    expect(csv).toContain(a.ticketNumber);
    expect(csv.trim().split("\n").pop()).toMatch(/^Total \(1 demo\),.*499\.00/);

    const pdf = await get("format=pdf&dateFrom=2026-01-01");
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect((await get("format=docx")).status).toBe(400);
  });
});
