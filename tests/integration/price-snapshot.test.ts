import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as partsPOST } from "@/app/api/catalogue/parts/route";
import { PATCH as partPATCH } from "@/app/api/catalogue/parts/[id]/route";
import { POST as lineItemsPOST } from "@/app/api/tickets/[id]/line-items/route";
import { GET as ticketGET } from "@/app/api/tickets/[id]/route";

describe("Historical price snapshot integrity (User Story 3)", () => {
  beforeEach(resetDb);

  it("leaves an existing ticket's line item unaffected by a later catalogue price change, while a new ticket picks up the new price", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Drain Pump", unitCost: 850 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticketA = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticketA.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticketA.id } },
    );

    await partPATCH(
      jsonRequest(`/api/catalogue/parts/${part.id}`, { method: "PATCH", cookie: superAdminCookie, body: { unitCost: 950 } }),
      { params: { id: part.id } },
    );

    const ticketADetail = await ticketGET(jsonRequest(`/api/tickets/${ticketA.id}`, { cookie }), { params: { id: ticketA.id } });
    const ticketABody = await ticketADetail.json();
    expect(ticketABody.lineItems[0].unitCostSnapshot).toBe(850);
    expect(ticketABody.bill.subtotal).toBe(850);

    const ticketB = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const newLineItemRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticketB.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticketB.id } },
    );
    const newLineItem = (await newLineItemRes.json()).lineItem;
    expect(newLineItem.unitCostSnapshot).toBe(950);
  });
});
