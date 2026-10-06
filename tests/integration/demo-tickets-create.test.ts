import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createDemoService, createDemoTicket, createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as createPOST } from "@/app/api/demo-tickets/route";
import { GET as historyGET } from "@/app/api/demo-tickets/history/route";
import { GET as serviceTicketsGET } from "@/app/api/tickets/route";
import { db } from "@/lib/db/client";
import { demoServices, demoTickets, demoTicketStatusHistory } from "@/lib/db/schema";

async function setup() {
  const store = await createStore({ name: "Balepet", storeCode: "BLP" });
  const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
  const cookie = await loginAs(sm.email, "Correct123!");
  const service = await createDemoService({ name: "Home demo", unitCost: "250.00" });
  const body = (extra: Record<string, unknown> = {}) => ({
    storeId: store.id,
    customerName: "Kavya R",
    customerPhone: "+919448811223",
    machineModel: "Juki DDL-8700",
    serialNumber: "DDL87-33321",
    invoiceNumber: "INV-2026-0042",
    demoServiceId: service.id,
    receivedDate: "2026-09-01",
    demoDate: "2026-09-05",
    ...extra,
  });
  const create = (extra?: Record<string, unknown>) =>
    createPOST(jsonRequest("/api/demo-tickets", { method: "POST", cookie, body: body(extra) }));
  return { store, sm, cookie, service, create };
}

describe("creating demo tickets (008 US1)", () => {
  beforeEach(resetDb);

  it("creates a New demo ticket with its own numbering, a service snapshot, and a creation history row", async () => {
    const { cookie, create } = await setup();
    const res = await create();
    expect(res.status).toBe(201);
    const { ticket } = await res.json();
    expect(ticket.ticketNumber).toBe("BLP-DEMO-2026-00001");
    expect(ticket.status).toBe("new");

    const [row] = await db.select().from(demoTickets).where(eq(demoTickets.id, ticket.id));
    expect(row).toMatchObject({ invoiceNumber: "INV-2026-0042", demoServiceName: "Home demo", demoServicePrice: "250.00", demoDate: "2026-09-05" });
    expect(row.createdAt.toISOString()).toBe("2026-09-01T06:30:00.000Z");
    expect(row.shortCode).toMatch(/^[A-Za-z0-9]{8}$/);
    const history = await db.select().from(demoTicketStatusHistory).where(eq(demoTicketStatusHistory.demoTicketId, ticket.id));
    expect(history).toHaveLength(1);

    expect((await (await create()).json()).ticket.ticketNumber).toBe("BLP-DEMO-2026-00002");

    // Never shows up among service tickets (FR-001).
    const serviceList = await (await serviceTicketsGET(jsonRequest("/api/tickets", { cookie }))).json();
    expect(serviceList.tickets).toEqual([]);
  });

  it("validates required fields, dates and the demo service", async () => {
    const { create, service } = await setup();
    expect((await (await create({ invoiceNumber: "  " })).json()).error).toEqual({ code: "missing_required_field", field: "invoiceNumber" });
    expect((await (await create({ demoDate: "2026-08-31" })).json()).error.code).toBe("demo_date_before_received");
    expect((await (await create({ demoDate: "2026-02-31" })).json()).error.code).toBe("invalid_demo_date");
    expect((await (await create({ receivedDate: "2999-01-01" })).json()).error.code).toBe("received_date_in_future");

    await db.update(demoServices).set({ active: false }).where(eq(demoServices.id, service.id));
    expect((await (await create()).json()).error.code).toBe("invalid_demo_service");
  });

  it("refuses a store outside the caller's scope", async () => {
    const { create } = await setup();
    const other = await createStore();
    expect((await create({ storeId: other.id })).status).toBe(403);
  });

  it("lists history by serial OR invoice number, but warns only from the 3rd demo of the same model + serial + invoice", async () => {
    const { store, sm, cookie } = await setup();
    const history = (q: string) => historyGET(jsonRequest(`/api/demo-tickets/history?${q}`, { cookie })).then((r) => r.json());
    const combo = "machineModel=juki%20ddl-8700&serialNumber=SN-1&invoiceNumber=INV-A";
    await createDemoTicket({ storeId: store.id, createdBy: sm.id, machineModel: "Juki DDL-8700", serialNumber: "SN-1", invoiceNumber: "INV-A" });

    let result = await history(combo);
    expect(result).toMatchObject({ activeCount: 1, warning: false });
    expect(result.entries[0].sameCombination).toBe(true);

    // Same serial but a different invoice, same invoice but a different model: listed, not counted.
    await createDemoTicket({ storeId: store.id, createdBy: sm.id, machineModel: "Juki DDL-8700", serialNumber: "SN-1", invoiceNumber: "INV-B" });
    await createDemoTicket({ storeId: store.id, createdBy: sm.id, machineModel: "Usha 8801", serialNumber: "SN-9", invoiceNumber: "inv-a" });
    result = await history(combo);
    expect(result.entries).toHaveLength(3);
    expect(result).toMatchObject({ activeCount: 1, warning: false });

    // A cancelled demo of the same combination doesn't count either.
    await createDemoTicket({ storeId: store.id, createdBy: sm.id, machineModel: "Juki DDL-8700", serialNumber: "SN-1", invoiceNumber: "INV-A", status: "cancelled" });
    result = await history(combo);
    expect(result).toMatchObject({ activeCount: 1, warning: false });

    // A 2nd live demo of the same combination (case/space-insensitive): the next is the 3rd.
    await createDemoTicket({ storeId: store.id, createdBy: sm.id, machineModel: " JUKI ddl-8700 ", serialNumber: "sn-1 ", invoiceNumber: " Inv-A" });
    result = await history(combo);
    expect(result).toMatchObject({ activeCount: 2, warning: true });
    expect(result.entries).toHaveLength(5);

    // Without the model the combination isn't known yet: history is listed, no warning.
    result = await history("serialNumber=SN-1&invoiceNumber=INV-A");
    expect(result).toMatchObject({ activeCount: 0, warning: false });
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it("returns the history with the created ticket", async () => {
    const { store, sm, create } = await setup();
    const same = { machineModel: "Juki DDL-8700", serialNumber: "DDL87-33321", invoiceNumber: "INV-2026-0042" };
    await createDemoTicket({ storeId: store.id, createdBy: sm.id, ...same });
    await createDemoTicket({ storeId: store.id, createdBy: sm.id, serialNumber: "DDL87-33321" });
    let { history } = await (await create()).json();
    expect(history.entries).toHaveLength(2);
    expect(history).toMatchObject({ activeCount: 1, warning: false });

    // Now two earlier demos share the full combination, so this one is the 3rd.
    ({ history } = await (await create()).json());
    expect(history).toMatchObject({ activeCount: 2, warning: true });
  });
});
