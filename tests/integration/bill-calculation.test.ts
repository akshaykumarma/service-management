import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as partsPOST } from "@/app/api/catalogue/parts/route";
import { POST as servicesPOST } from "@/app/api/catalogue/services/route";
import { POST as lineItemsPOST } from "@/app/api/tickets/[id]/line-items/route";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";

describe("Automatic bill calculation with tax (User Story 1)", () => {
  beforeEach(resetDb);

  it("computes subtotal, tax, and total correctly across a part and a service", async () => {
    const store = await createStore();
    await db.update(stores).set({ taxRate: "18.00" }).where(eq(stores.id, store.id));

    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Drain Pump", unitCost: 850 } }),
    );
    const part = (await partRes.json()).part;
    const serviceRes = await servicesPOST(
      jsonRequest("/api/catalogue/services", { method: "POST", cookie: superAdminCookie, body: { name: "Diagnostic", unitCost: 200 } }),
    );
    const service = (await serviceRes.json()).service;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const addPartRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
    expect(addPartRes.status).toBe(201);
    const afterPart = await addPartRes.json();
    expect(afterPart.bill.subtotal).toBe(850);

    const addServiceRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "service", itemId: service.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
    const afterService = await addServiceRes.json();
    expect(afterService.bill.subtotal).toBe(1050);
    expect(afterService.bill.taxAmount).toBe(189); // 1050 * 0.18
    expect(afterService.bill.total).toBe(1239);
  });

  it("rejects adding a line item to a ticket that is still Open", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open" });
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
    expect((await res.json()).error.code).toBe("ticket_status_invalid");
  });

  it("rejects zero and negative quantities", async () => {
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

    for (const quantity of [0, -1]) {
      const res = await lineItemsPOST(
        jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
          method: "POST",
          cookie,
          body: { itemType: "part", itemId: part.id, quantity },
        }),
        { params: { id: ticket.id } },
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_quantity");
    }
  });

  it("rejects adding a deactivated catalogue item", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;
    const { PATCH: partPATCH } = await import("@/app/api/catalogue/parts/[id]/route");
    await partPATCH(
      jsonRequest(`/api/catalogue/parts/${part.id}`, { method: "PATCH", cookie: superAdminCookie, body: { active: false } }),
      { params: { id: part.id } },
    );

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("item_inactive");
  });
});
