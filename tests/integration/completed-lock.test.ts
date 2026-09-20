import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as partsPOST } from "@/app/api/catalogue/parts/route";
import { POST as lineItemsPOST } from "@/app/api/tickets/[id]/line-items/route";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";

describe("Completed-lock persists across a backward transition (FR-015, the compound cross-spec case)", () => {
  beforeEach(resetDb);

  it("still refuses line-item changes after a Completed ticket is moved backward to In Progress", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Belt", unitCost: 100 } }),
    );
    const part = (await partRes.json()).part;

    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
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

    // Move it to Completed via 003-ticket-lifecycle's own status endpoint.
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "completed" } }),
      { params: { id: ticket.id } },
    );

    const stillLockedRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
    expect(stillLockedRes.status).toBe(409);
    expect((await stillLockedRes.json()).error.code).toBe("bill_locked");

    // Admin moves it BACKWARD to In Progress (003's own Delivered/backward rules —
    // here just a plain backward move, which only needs a comment, not Admin-only,
    // but using Admin to mirror quickstart.md's own worked example).
    const adminCookie = await loginAs(admin.email, "Correct123!");
    const backwardRes = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { toStatus: "in_progress", comment: "reopening" },
      }),
      { params: { id: ticket.id } },
    );
    expect(backwardRes.status).toBe(200);

    // The lock does NOT lift on backward transition — this is the whole point of FR-015.
    const stillLockedAfterBackwardRes = await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
        method: "POST",
        cookie,
        body: { itemType: "part", itemId: part.id, quantity: 1 },
      }),
      { params: { id: ticket.id } },
    );
    expect(stillLockedAfterBackwardRes.status).toBe(409);
    expect((await stillLockedAfterBackwardRes.json()).error.code).toBe("bill_locked");
  });
});
