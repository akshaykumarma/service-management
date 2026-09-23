import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as partsGET, POST as partsPOST } from "@/app/api/catalogue/parts/route";
import { PATCH as partPATCH } from "@/app/api/catalogue/parts/[id]/route";
import { GET as servicesGET, POST as servicesPOST } from "@/app/api/catalogue/services/route";
import { PATCH as servicePATCH } from "@/app/api/catalogue/services/[id]/route";

describe("POST /api/catalogue/parts", () => {
  beforeEach(resetDb);

  it("201s and creates a part for a Super Admin", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await partsPOST(
      jsonRequest("/api/catalogue/parts", {
        method: "POST",
        cookie,
        body: { name: "Drain Pump", sku: "DP-100", unitCost: 850, category: "Washing Machine" },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.part.name).toBe("Drain Pump");
  });

  it("400s with invalid_unit_cost for a negative cost", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "X", unitCost: -1 } }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_unit_cost");
  });

  it("409s with duplicate_name for an existing active part", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    await partsPOST(jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Belt", unitCost: 100 } }));
    const res = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Belt", unitCost: 200 } }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("duplicate_name");
  });

  it("403s for a non-Super-Admin caller", async () => {
    const admin = await createUser({ role: "admin", password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "X", unitCost: 10 } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/catalogue/parts", () => {
  beforeEach(resetDb);

  it("200s and lists active parts for any authenticated role", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    await partsPOST(jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Belt", unitCost: 100 } }));

    const smCookie = await loginAs(sm.email, "Correct123!");
    const res = await partsGET(jsonRequest("/api/catalogue/parts", { cookie: smCookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parts.some((p: { name: string }) => p.name === "Belt")).toBe(true);
  });
});

describe("PATCH /api/catalogue/parts/:id", () => {
  beforeEach(resetDb);

  it("200s and deactivates a part", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const createRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const created = (await createRes.json()).part;

    const res = await partPATCH(
      jsonRequest(`/api/catalogue/parts/${created.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: created.id } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).part.active).toBe(false);
  });

  it("404s for a non-existent part", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await partPATCH(
      jsonRequest("/api/catalogue/parts/00000000-0000-0000-0000-000000000000", {
        method: "PATCH",
        cookie,
        body: { active: false },
      }),
      { params: { id: "00000000-0000-0000-0000-000000000000" } },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/catalogue/services and GET/PATCH", () => {
  beforeEach(resetDb);

  it("creates, lists, and deactivates a service", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const createRes = await servicesPOST(
      jsonRequest("/api/catalogue/services", {
        method: "POST",
        cookie,
        body: { name: "Diagnostic", description: "General diagnostic", unitCost: 200 },
      }),
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).service;

    const listRes = await servicesGET(jsonRequest("/api/catalogue/services", { cookie }));
    const listBody = await listRes.json();
    expect(listBody.services.some((s: { id: string }) => s.id === created.id)).toBe(true);

    const patchRes = await servicePATCH(
      jsonRequest(`/api/catalogue/services/${created.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: created.id } },
    );
    expect(patchRes.status).toBe(200);
  });
});

import { createStore, createTicket } from "../helpers/factories";
import { POST as lineItemsPOST } from "@/app/api/tickets/[id]/line-items/route";
import { PATCH as lineItemPATCH, DELETE as lineItemDELETE } from "@/app/api/tickets/[id]/line-items/[lineItemId]/route";

describe("POST /api/tickets/:ticketId/line-items", () => {
  beforeEach(resetDb);

  it("201s and returns the line item plus recalculated bill", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 2 },
      }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.lineItem.quantity).toBe(2);
    expect(body.lineItem.lineTotal).toBe(200);
    expect(body.bill.subtotal).toBe(200);
  });

  it("409s with bill_locked once the ticket has ever reached Completed", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "completed" });
    const { db } = await import("@/lib/db/client");
    const { statusHistory } = await import("@/lib/db/schema");
    await db.insert(statusHistory).values({ ticketId: ticket.id, fromStatus: "in_progress", toStatus: "completed", actorId: sm.id });

    const cookie = await loginAs(sm.email, "Correct123!");
    const res = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("bill_locked");
  });
});

describe("PATCH/DELETE /api/tickets/:ticketId/line-items/:lineItemId", () => {
  beforeEach(resetDb);

  it("recomputes lineTotal from the existing unitCostSnapshot on a quantity change", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const addRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
    const lineItem = (await addRes.json()).lineItem;

    // Change the catalogue price after the line item exists — the PATCH must still use
    // the ORIGINAL snapshot, not the new catalogue price.
    const { PATCH: partPATCH } = await import("@/app/api/catalogue/parts/[id]/route");
    await partPATCH(
      jsonRequest(`/api/catalogue/parts/${part.id}`, { method: "PATCH", cookie: superAdminCookie, body: { unitCost: 999 } }),
      { params: { id: part.id } },
    );

    const patchRes = await lineItemPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/line-items/${lineItem.id}`, { method: "PATCH", cookie, body: { quantity: 3 } }),
      { params: { id: ticket.id, lineItemId: lineItem.id } },
    );
    expect(patchRes.status).toBe(200);
    const body = await patchRes.json();
    expect(body.lineItem.lineTotal).toBe(300); // 3 * 100 (original snapshot), not 3 * 999
  });

  it("lets a Service Manager override the unit cost directly on the ticket, without touching the catalogue item", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const addRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 2 },
      }),
      { params: { id: ticket.id } },
    );
    const lineItem = (await addRes.json()).lineItem;

    const patchRes = await lineItemPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/line-items/${lineItem.id}`, { method: "PATCH", cookie, body: { unitCost: 80 } }),
      { params: { id: ticket.id, lineItemId: lineItem.id } },
    );
    expect(patchRes.status).toBe(200);
    const body = await patchRes.json();
    expect(body.lineItem.unitCostSnapshot).toBe(80);
    expect(body.lineItem.lineTotal).toBe(160); // 2 * 80, the overridden price

    // The catalogue item itself is untouched.
    const catalogueRes = await partsGET(jsonRequest("/api/catalogue/parts", { cookie: superAdminCookie }));
    const catalogueBelt = (await catalogueRes.json()).parts.find((p: { id: string }) => p.id === part.id);
    expect(catalogueBelt.unitCost).toBe(100);
  });

  it("400s with invalid_unit_cost for a negative price", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const addRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
    const lineItem = (await addRes.json()).lineItem;

    const patchRes = await lineItemPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/line-items/${lineItem.id}`, { method: "PATCH", cookie, body: { unitCost: -5 } }),
      { params: { id: ticket.id, lineItemId: lineItem.id } },
    );
    expect(patchRes.status).toBe(400);
    expect((await patchRes.json()).error.code).toBe("invalid_unit_cost");
  });

  it("removes a line item and returns the recalculated bill", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const addRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
    const lineItem = (await addRes.json()).lineItem;

    const res = await lineItemDELETE(
      jsonRequest(`/api/tickets/${ticket.id}/line-items/${lineItem.id}`, { method: "DELETE", cookie }),
      { params: { id: ticket.id, lineItemId: lineItem.id } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).bill.subtotal).toBe(0);
  });
});

import { PATCH as taxRatePATCH } from "@/app/api/tickets/[id]/tax-rate/route";

describe("PATCH /api/tickets/:ticketId/tax-rate", () => {
  beforeEach(resetDb);

  it("defaults a new ticket to 0% tax, and lets a Service Manager set it, re-pricing the bill", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );

    const res = await taxRatePATCH(
      jsonRequest(`/api/tickets/${ticket.id}/tax-rate`, { method: "PATCH", cookie, body: { taxRate: 18 } }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.taxRate).toBe(18);
    expect(body.bill.taxAmount).toBe(18); // 18% of 100
    expect(body.bill.total).toBe(118);
  });

  it("400s with invalid_tax_rate outside [0, 100]", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await taxRatePATCH(
      jsonRequest(`/api/tickets/${ticket.id}/tax-rate`, { method: "PATCH", cookie, body: { taxRate: 150 } }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_tax_rate");
  });

  it("409s with bill_locked once the ticket has reached Completed", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const { PATCH: statusPATCH } = await import("@/app/api/tickets/[id]/status/route");
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "completed" } }),
      { params: { id: ticket.id } },
    );

    const res = await taxRatePATCH(
      jsonRequest(`/api/tickets/${ticket.id}/tax-rate`, { method: "PATCH", cookie, body: { taxRate: 10 } }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("bill_locked");
  });
});
