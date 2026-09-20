import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as ticketsGET } from "@/app/api/tickets/route";

describe("GET /api/tickets filter query parameters", () => {
  beforeEach(resetDb);

  it("200s with an empty array when no tickets match the applied filters (FR-016)", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    await createTicket({ storeId: store.id, createdBy: sm.id, status: "open" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsGET(jsonRequest("/api/tickets?ticketId=NO-SUCH-TICKET", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets).toEqual([]);
  });

  it("applies status[], customerName, and machineModel together as AND", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const matching = await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      status: "in_progress",
      customerName: "Priya Sharma",
      machineModel: "LG-XYZ",
    });
    await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      status: "in_progress",
      customerName: "Priya Sharma",
      machineModel: "Samsung-ABC",
    });
    await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      status: "completed",
      customerName: "Priya Sharma",
      machineModel: "LG-XYZ",
    });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsGET(
      jsonRequest("/api/tickets?status=in_progress&customerName=Sharma&machineModel=LG-XYZ", { cookie }),
    );
    const body = await res.json();
    expect(body.tickets.map((t: { id: string }) => t.id)).toEqual([matching.id]);
  });

  it("restricts storeId[] to the caller's visible stores (FR-010)", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [storeA.id], password: "Correct123!" });
    const ticketA = await createTicket({ storeId: storeA.id, createdBy: sm.id, status: "open" });
    const cookie = await loginAs(sm.email, "Correct123!");

    // Requesting an out-of-scope store id is simply excluded, not an error.
    const res = await ticketsGET(jsonRequest(`/api/tickets?storeId=${storeB.id}`, { cookie }));
    const body = await res.json();
    expect(body.tickets).toEqual([]);

    const resOwn = await ticketsGET(jsonRequest(`/api/tickets?storeId=${storeA.id}`, { cookie }));
    const bodyOwn = await resOwn.json();
    expect(bodyOwn.tickets.map((t: { id: string }) => t.id)).toEqual([ticketA.id]);
  });

  it("filters by a creation date range", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const today = new Date().toISOString().slice(0, 10);
    const res = await ticketsGET(jsonRequest(`/api/tickets?dateFrom=${today}&dateTo=${today}`, { cookie }));
    const body = await res.json();
    expect(body.tickets.map((t: { id: string }) => t.id)).toContain(ticket.id);

    const past = "2000-01-01";
    const resPast = await ticketsGET(jsonRequest(`/api/tickets?dateFrom=${past}&dateTo=${past}`, { cookie }));
    const bodyPast = await resPast.json();
    expect(bodyPast.tickets).toEqual([]);
  });
});
