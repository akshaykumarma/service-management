import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as ticketsGET } from "@/app/api/tickets/route";
import { GET as auditTrailGET } from "@/app/api/tickets/[id]/audit-trail/route";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { GET as summaryGET } from "@/app/api/reports/summary/route";
import { GET as exportGET } from "@/app/api/reports/export/route";

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

  it("filters by customerPhone", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const matching = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open", customerPhone: "+919876543210" });
    await createTicket({ storeId: store.id, createdBy: sm.id, status: "open", customerPhone: "+911111111111" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsGET(jsonRequest("/api/tickets?customerPhone=9876543210", { cookie }));
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

describe("GET /api/tickets/:id/audit-trail", () => {
  beforeEach(resetDb);

  it("200s with a chronologically-sorted list of entries, including the ticket's creation", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open" });
    const cookie = await loginAs(sm.email, "Correct123!");

    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "in_progress", comment: null } }),
      { params: { id: ticket.id } },
    );

    const res = await auditTrailGET(jsonRequest(`/api/tickets/${ticket.id}/audit-trail`, { cookie }), {
      params: { id: ticket.id },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeGreaterThanOrEqual(1);
    expect(body.entries[0].source).toBe("status_history");
    for (let i = 1; i < body.entries.length; i++) {
      expect(new Date(body.entries[i].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(body.entries[i - 1].timestamp).getTime(),
      );
    }
  });

  it("404s for a ticket outside the caller's scope", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const smA = await createUser({ role: "service_manager", storeIds: [storeA.id], password: "Correct123!" });
    const smB = await createUser({ role: "service_manager", storeIds: [storeB.id], password: "Correct123!" });
    const ticketB = await createTicket({ storeId: storeB.id, createdBy: smB.id, status: "open" });
    const cookieA = await loginAs(smA.email, "Correct123!");

    const res = await auditTrailGET(jsonRequest(`/api/tickets/${ticketB.id}/audit-trail`, { cookie: cookieA }), {
      params: { id: ticketB.id },
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/reports/summary", () => {
  beforeEach(resetDb);

  it("403s for a Store Service Manager", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await summaryGET(
      jsonRequest(`/api/reports/summary?storeId=${store.id}&dateFrom=2026-01-01&dateTo=2026-12-31`, { cookie }),
    );
    expect(res.status).toBe(403);
  });

  it("200s for an Admin with the documented shape", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await summaryGET(
      jsonRequest(`/api/reports/summary?storeId=${store.id}&dateFrom=2026-01-01&dateTo=2026-12-31`, { cookie }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      totalTickets: expect.any(Number),
      byStatus: expect.any(Object),
      avgResolutionTimeHours: expect.any(Number),
      partsRevenue: expect.any(Number),
      servicesRevenue: expect.any(Number),
    });
  });
});

describe("GET /api/reports/export", () => {
  beforeEach(resetDb);

  it("400s invalid_format for anything other than csv/pdf", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await exportGET(jsonRequest("/api/reports/export?format=xml", { cookie }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_format");
  });

  it("403s for a Store Service Manager", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await exportGET(jsonRequest("/api/reports/export?format=csv", { cookie }));
    expect(res.status).toBe(403);
  });

  it("200s a CSV list export with the correct content type", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    await createTicket({ storeId: store.id, createdBy: admin.id, status: "open" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await exportGET(jsonRequest("/api/reports/export?format=csv", { cookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("ticketNumber");
  });

  it("200s a PDF summary export with the correct content type", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await exportGET(
      jsonRequest(`/api/reports/export?format=pdf&type=summary&storeId=${store.id}&dateFrom=2026-01-01&dateTo=2026-12-31`, {
        cookie,
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  });
});
