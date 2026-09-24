import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as storesPOST, GET as storesGET } from "@/app/api/admin/stores/route";
import { PATCH as storePATCH } from "@/app/api/admin/stores/[id]/route";
import { GET as intakeStoresGET } from "@/app/api/stores/route";
import { POST as ticketsPOST } from "@/app/api/tickets/route";
import { POST as partsPOST } from "@/app/api/catalogue/parts/route";
import { POST as lineItemsPOST } from "@/app/api/tickets/[id]/line-items/route";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";

describe("Store setup flowing into billing (User Story 2)", () => {
  beforeEach(resetDb);

  it("no longer uses the store's tax rate for bills (tickets default to 0%, independent of the store's rate), and excludes an inactive store from ticket creation", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const createRes = await storesPOST(
      jsonRequest("/api/admin/stores", {
        method: "POST",
        cookie,
        body: { name: "Koramangala", address: "1 Main St", primaryContact: "Ravi", whatsappNumber: "+919876543210", taxRate: 18 },
      }),
    );
    const { store } = await createRes.json();

    const activateRes = await storePATCH(
      jsonRequest(`/api/admin/stores/${store.id}`, { method: "PATCH", cookie, body: { active: true } }),
      { params: { id: store.id } },
    );
    expect(activateRes.status).toBe(200);

    // Now selectable at intake.
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const smCookie = await loginAs(sm.email, "Correct123!");
    const intakeList = await intakeStoresGET(jsonRequest("/api/stores", { cookie: smCookie }));
    expect((await intakeList.json()).stores.some((s: { id: string }) => s.id === store.id)).toBe(true);

    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie, body: { name: "Drain Pump", unitCost: 1000 } }),
    );
    const part = (await partRes.json()).part;

    const ticketRes = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie: smCookie,
        body: {
          storeId: store.id,
          customerName: "Test Customer",
          customerPhone: "+919999911111",
          machineModel: "Model-X",
          serialNumber: "SN-Model-X",
          issueDescription: "Test",
        },
      }),
    );
    expect(ticketRes.status).toBe(201);
    const { ticket } = await ticketRes.json();

    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie: smCookie, body: { toStatus: "in_progress" } }),
      { params: { id: ticket.id } },
    );

    const addLineItemRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, { method: "POST", cookie: smCookie, body: { itemType: "part", itemId: part.id, quantity: 1 } }),
      { params: { id: ticket.id } },
    );
    const addLineItemBody = await addLineItemRes.json();
    // Deviation from bill-calculation.ts's original design: tax is now per-ticket, so the
    // store's 18% rate isn't consulted at all — every ticket starts at 0%.
    expect(addLineItemBody.bill.taxAmount).toBe(0);

    // A store-level rate change (still editable, still shown in the admin console) has no
    // effect on any ticket's bill, past or future.
    await storePATCH(
      jsonRequest(`/api/admin/stores/${store.id}`, { method: "PATCH", cookie, body: { taxRate: 12 } }),
      { params: { id: store.id } },
    );

    const ticket2Res = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie: smCookie,
        body: {
          storeId: store.id,
          customerName: "Test Customer 2",
          customerPhone: "+919999922222",
          machineModel: "Model-X",
          serialNumber: "SN-Model-X",
          issueDescription: "Test",
        },
      }),
    );
    const { ticket: ticket2 } = await ticket2Res.json();
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket2.id}/status`, { method: "PATCH", cookie: smCookie, body: { toStatus: "in_progress" } }),
      { params: { id: ticket2.id } },
    );
    const addLineItem2Res = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket2.id}/line-items`, { method: "POST", cookie: smCookie, body: { itemType: "part", itemId: part.id, quantity: 1 } }),
      { params: { id: ticket2.id } },
    );
    const addLineItem2Body = await addLineItem2Res.json();
    expect(addLineItem2Body.bill.taxAmount).toBe(0); // still 0% — the store's 12% is never consulted

    // Deactivate: no longer selectable, no longer usable for new tickets.
    await storePATCH(jsonRequest(`/api/admin/stores/${store.id}`, { method: "PATCH", cookie, body: { active: false } }), {
      params: { id: store.id },
    });

    const intakeListAfter = await intakeStoresGET(jsonRequest("/api/stores", { cookie: smCookie }));
    expect((await intakeListAfter.json()).stores.some((s: { id: string }) => s.id === store.id)).toBe(false);

    const blockedTicketRes = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie: smCookie,
        body: {
          storeId: store.id,
          customerName: "Blocked",
          customerPhone: "+919999933333",
          machineModel: "Model-X",
          serialNumber: "SN-Model-X",
          issueDescription: "Test",
        },
      }),
    );
    expect(blockedTicketRes.status).toBe(409);
    expect((await blockedTicketRes.json()).error.code).toBe("store_inactive");

    // Store listing shows the correct final tax rate for the admin console table.
    const listRes = await storesGET(jsonRequest("/api/admin/stores", { cookie }));
    const listBody = await listRes.json();
    expect(listBody.stores.find((s: { id: string }) => s.id === store.id).taxRate).toBe(12);
  });
});
