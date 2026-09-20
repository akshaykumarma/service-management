import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { GET as ticketsGET } from "@/app/api/tickets/route";

describe("Mandatory-reason holds & cancellations (User Story 3)", () => {
  beforeEach(resetDb);

  it("rejects On Hold without a reason and accepts it with one", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const rejected = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "on_hold", comment: null } }),
      { params: { id: ticket.id } },
    );
    expect(rejected.status).toBe(400);

    const accepted = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie,
        body: { toStatus: "on_hold", comment: "waiting on part" },
      }),
      { params: { id: ticket.id } },
    );
    expect(accepted.status).toBe(200);
  });

  it("denies Cancelled to a Store Service Manager and accepts it from an Admin, hidden from the default list but visible with includeCancelled", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open" });

    const smCookie = await loginAs(sm.email, "Correct123!");
    const smAttempt = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie: smCookie,
        body: { toStatus: "cancelled", comment: "customer withdrew" },
      }),
      { params: { id: ticket.id } },
    );
    expect(smAttempt.status).toBe(403);

    const adminCookie = await loginAs(admin.email, "Correct123!");
    const adminAttempt = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { toStatus: "cancelled", comment: "customer withdrew" },
      }),
      { params: { id: ticket.id } },
    );
    expect(adminAttempt.status).toBe(200);

    const defaultList = await ticketsGET(jsonRequest("/api/tickets", { cookie: adminCookie }));
    const defaultBody = await defaultList.json();
    expect(defaultBody.tickets.some((t: { id: string }) => t.id === ticket.id)).toBe(false);

    const allList = await ticketsGET(jsonRequest("/api/tickets?includeCancelled=true", { cookie: adminCookie }));
    const allBody = await allList.json();
    expect(allBody.tickets.some((t: { id: string }) => t.id === ticket.id)).toBe(true);
  });
});
