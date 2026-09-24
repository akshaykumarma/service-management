import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as ticketsPOST, GET as ticketsGET } from "@/app/api/tickets/route";

describe("Filtered search across tickets (User Story 3)", () => {
  beforeEach(resetDb);

  it("matches the Customer Name filter against each ticket's own historical intake-time name, not a later-corrected canonical name (FR-008, SC-008)", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");
    const phone = "+919888877777";

    const firstRes = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Sunita Sharma",
          customerPhone: phone,
          machineModel: "Model-A",
          serialNumber: "SN-Model-A",
          issueDescription: "First visit",
        },
      }),
    );
    const { ticket: firstTicket } = await firstRes.json();

    // Same phone (same canonical Customer), corrected name on a later ticket — per
    // 003's resolveCustomer, this updates customers.name but each ticket keeps its own
    // customerName snapshot from when it was created.
    const secondRes = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Sunita Verma",
          customerPhone: phone,
          machineModel: "Model-A",
          serialNumber: "SN-Model-A",
          issueDescription: "Second visit, name corrected",
        },
      }),
    );
    const { ticket: secondTicket } = await secondRes.json();

    const oldNameSearch = await ticketsGET(jsonRequest("/api/tickets?customerName=Sharma", { cookie }));
    const oldNameBody = await oldNameSearch.json();
    expect(oldNameBody.tickets.map((t: { id: string }) => t.id)).toEqual([firstTicket.id]);

    const newNameSearch = await ticketsGET(jsonRequest("/api/tickets?customerName=Verma", { cookie }));
    const newNameBody = await newNameSearch.json();
    expect(newNameBody.tickets.map((t: { id: string }) => t.id)).toEqual([secondTicket.id]);
  });

  it("restricts the Store filter's available choices to the viewer's visible stores for a Store Service Manager", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [storeA.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");
    const other = await createUser({ role: "service_manager", storeIds: [storeB.id], password: "Correct123!" });
    const ticketB = await createTicket({ storeId: storeB.id, createdBy: other.id, status: "open" });

    // Requesting both storeA (own) and storeB (not visible) still excludes storeB's ticket.
    const res = await ticketsGET(jsonRequest(`/api/tickets?storeId=${storeA.id}&storeId=${storeB.id}`, { cookie }));
    const body = await res.json();
    expect(body.tickets.map((t: { id: string }) => t.id)).not.toContain(ticketB.id);
  });
});
