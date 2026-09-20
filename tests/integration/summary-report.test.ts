import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { POST as partsPOST } from "@/app/api/catalogue/parts/route";
import { POST as servicesPOST } from "@/app/api/catalogue/services/route";
import { POST as lineItemsPOST } from "@/app/api/tickets/[id]/line-items/route";
import { GET as summaryGET } from "@/app/api/reports/summary/route";
import { db } from "@/lib/db/client";
import { statusHistory, tickets } from "@/lib/db/schema";

describe("Summary report aggregation (User Story 5)", () => {
  beforeEach(resetDb);

  it("attributes a ticket to the period containing its FIRST-Completed timestamp, not its creation date (FR-017, SC-006), and excludes a ticket not yet Completed", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    // Created in September, first-Completed in October.
    const septTicket = await createTicket({ storeId: store.id, createdBy: admin.id, status: "in_progress" });
    await db.update(tickets).set({ createdAt: new Date("2026-09-05T00:00:00Z") }).where(eq(tickets.id, septTicket.id));
    await statusPATCH(
      jsonRequest(`/api/tickets/${septTicket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "completed", comment: null } }),
      { params: { id: septTicket.id } },
    );
    await db
      .update(statusHistory)
      .set({ createdAt: new Date("2026-10-03T00:00:00Z") })
      .where(eq(statusHistory.ticketId, septTicket.id));

    // Never reaches Completed — must not appear in any period.
    await createTicket({ storeId: store.id, createdBy: admin.id, status: "in_progress" });

    const septRes = await summaryGET(
      jsonRequest(`/api/reports/summary?storeId=${store.id}&dateFrom=2026-09-01&dateTo=2026-09-30`, { cookie }),
    );
    const septBody = await septRes.json();
    expect(septBody.totalTickets).toBe(0);

    const octRes = await summaryGET(
      jsonRequest(`/api/reports/summary?storeId=${store.id}&dateFrom=2026-10-01&dateTo=2026-10-31`, { cookie }),
    );
    const octBody = await octRes.json();
    expect(octBody.totalTickets).toBe(1);
  });

  it("uses the FIRST Completed timestamp even if the ticket is later moved backward and re-completed", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const ticket = await createTicket({ storeId: store.id, createdBy: admin.id, status: "in_progress" });
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "completed", comment: null } }),
      { params: { id: ticket.id } },
    );
    await db
      .update(statusHistory)
      .set({ createdAt: new Date("2026-05-15T00:00:00Z") })
      .where(eq(statusHistory.ticketId, ticket.id));

    // Move backward, then re-complete much later — the report must still use May, not this later date.
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "in_progress", comment: "recheck" } }),
      { params: { id: ticket.id } },
    );
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "completed", comment: null } }),
      { params: { id: ticket.id } },
    );

    const mayRes = await summaryGET(
      jsonRequest(`/api/reports/summary?storeId=${store.id}&dateFrom=2026-05-01&dateTo=2026-05-31`, { cookie }),
    );
    expect((await mayRes.json()).totalTickets).toBe(1);
  });

  it("measures average resolution time as Open-to-first-Completed, excluding post-Completed pickup wait (FR-018, SC-007), and splits parts/services revenue", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");

    const ticket = await createTicket({ storeId: store.id, createdBy: admin.id, status: "in_progress" });
    await db.update(tickets).set({ createdAt: new Date("2026-06-01T00:00:00Z") }).where(eq(tickets.id, ticket.id));

    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Drain Pump", unitCost: 500 } }),
    );
    const part = (await partRes.json()).part;
    const serviceRes = await servicesPOST(
      jsonRequest("/api/catalogue/services", { method: "POST", cookie: superAdminCookie, body: { name: "Diagnostic", unitCost: 200 } }),
    );
    const service = (await serviceRes.json()).service;
    await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, { method: "POST", cookie, body: { itemType: "part", itemId: part.id, quantity: 1 } }),
      { params: { id: ticket.id } },
    );
    await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, { method: "POST", cookie, body: { itemType: "service", itemId: service.id, quantity: 1 } }),
      { params: { id: ticket.id } },
    );

    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "completed", comment: null } }),
      { params: { id: ticket.id } },
    );
    // Completed exactly 48 hours after creation.
    await db
      .update(statusHistory)
      .set({ createdAt: new Date("2026-06-03T00:00:00Z") })
      .where(eq(statusHistory.ticketId, ticket.id));

    // Simulate a long pickup wait (way later) before Delivered — must not affect resolution time.
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "delivered", comment: null } }),
      { params: { id: ticket.id } },
    );

    const res = await summaryGET(
      jsonRequest(`/api/reports/summary?storeId=${store.id}&dateFrom=2026-06-01&dateTo=2026-06-30`, { cookie }),
    );
    const body = await res.json();
    expect(body.avgResolutionTimeHours).toBeCloseTo(48, 0);
    expect(body.partsRevenue).toBeCloseTo(500, 2);
    expect(body.servicesRevenue).toBeCloseTo(200, 2);
    expect(body.byStatus.delivered).toBe(1);
  });
});
