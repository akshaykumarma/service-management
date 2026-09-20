import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as ticketsGET } from "@/app/api/tickets/route";

describe("Kanban board role/store scoping (User Story 1)", () => {
  beforeEach(resetDb);

  it("scopes a Store Service Manager to only their store, an Admin to their assigned stores, and a Super Admin to all", async () => {
    const storeA = await createStore();
    const storeB = await createStore();

    const sm = await createUser({ role: "service_manager", storeIds: [storeA.id], password: "Correct123!" });
    const admin = await createUser({ role: "admin", storeIds: [storeA.id, storeB.id], password: "Correct123!" });
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });

    const ticketA = await createTicket({ storeId: storeA.id, createdBy: sm.id, status: "open" });
    const ticketB = await createTicket({ storeId: storeB.id, createdBy: admin.id, status: "open" });

    const smCookie = await loginAs(sm.email, "Correct123!");
    const smRes = await ticketsGET(jsonRequest("/api/tickets", { cookie: smCookie }));
    const smBody = await smRes.json();
    expect(smBody.tickets.map((t: { id: string }) => t.id)).toEqual([ticketA.id]);

    const adminCookie = await loginAs(admin.email, "Correct123!");
    const adminRes = await ticketsGET(jsonRequest("/api/tickets", { cookie: adminCookie }));
    const adminBody = await adminRes.json();
    expect(adminBody.tickets.map((t: { id: string }) => t.id).sort()).toEqual([ticketA.id, ticketB.id].sort());

    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const superAdminRes = await ticketsGET(jsonRequest("/api/tickets", { cookie: superAdminCookie }));
    const superAdminBody = await superAdminRes.json();
    expect(superAdminBody.tickets.map((t: { id: string }) => t.id).sort()).toEqual([ticketA.id, ticketB.id].sort());
  });

  it("returns the board-card shape including daysOpen", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsGET(jsonRequest("/api/tickets", { cookie }));
    const body = await res.json();
    const card = body.tickets.find((t: { id: string }) => t.id === ticket.id);
    expect(card).toMatchObject({
      ticketNumber: ticket.ticketNumber,
      customerName: expect.any(String),
      machineModel: expect.any(String),
      status: "open",
    });
    expect(card.daysOpen).toBe(0);
  });
});
