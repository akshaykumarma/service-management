import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as partsPOST } from "@/app/api/catalogue/parts/route";
import { POST as lineItemsPOST } from "@/app/api/tickets/[id]/line-items/route";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";

describe("Bill editability tracks the ticket's current status, not its history (post-v1, reverses FR-015)", () => {
  beforeEach(resetDb);

  it("blocks line-item changes while Completed, allows them again once moved backward to In Progress, and re-blocks on re-reaching Completed", async () => {
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
    const adminCookie = await loginAs(admin.email, "Correct123!");

    const addLineItem = () =>
      lineItemsPOST(
        jsonRequest(`/api/tickets/${ticket.id}/line-items`, {
          method: "POST",
          cookie,
          body: { itemType: "part", itemId: part.id, quantity: 1 },
        }),
        { params: { id: ticket.id } },
      );

    await addLineItem();

    // Move it to Completed via 003-ticket-lifecycle's own status endpoint.
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "completed" } }),
      { params: { id: ticket.id } },
    );

    const lockedRes = await addLineItem();
    expect(lockedRes.status).toBe(409);
    expect((await lockedRes.json()).error.code).toBe("ticket_status_invalid");

    // Admin moves it BACKWARD to In Progress (003's own Delivered/backward rules —
    // here just a plain backward move, which only needs a comment, not Admin-only,
    // but using Admin to mirror quickstart.md's own worked example).
    const backwardRes = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { toStatus: "in_progress", comment: "reopening" },
      }),
      { params: { id: ticket.id } },
    );
    expect(backwardRes.status).toBe(200);

    // Reversed from the original FR-015: the bill is editable again once the ticket has
    // left Completed, per direct product feedback ("unable to update/add part or service
    // after moving the ticket from complete to in progress").
    const unlockedRes = await addLineItem();
    expect(unlockedRes.status).toBe(201);

    // Reaching Completed again re-blocks it — the rule tracks current status, so it's
    // symmetric, not a one-way "ever unlocked" flag either.
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "completed" } }),
      { params: { id: ticket.id } },
    );
    const reLockedRes = await addLineItem();
    expect(reLockedRes.status).toBe(409);
    expect((await reLockedRes.json()).error.code).toBe("ticket_status_invalid");
  });
});
