import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { PATCH as ticketPATCH } from "@/app/api/tickets/[id]/route";
import { GET as auditTrailGET } from "@/app/api/tickets/[id]/audit-trail/route";
import { db } from "@/lib/db/client";
import { customers, tickets } from "@/lib/db/schema";

async function patch(ticketId: string, cookie: string, body: unknown) {
  return ticketPATCH(jsonRequest(`/api/tickets/${ticketId}`, { method: "PATCH", cookie, body }), { params: { id: ticketId } });
}

describe("editing a ticket's intake details (post-v1 product feedback)", () => {
  beforeEach(resetDb);

  async function setup(status: "open" | "delivered" | "cancelled" = "open") {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status, serialNumber: "OLD-SN" });
    return { store, sm, cookie, ticket };
  }

  it("updates name, phone, model, serial and issue, re-links the customer, and records it in the audit trail", async () => {
    const { cookie, ticket } = await setup();

    const res = await patch(ticket.id, cookie, {
      customerName: "Nandini S",
      customerPhone: "+919019055667",
      machineModel: "Singer Heavy Duty 4423",
      serialNumber: "HD4423-778120",
      issueDescription: "Needle breaking on thick fabric",
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row).toMatchObject({
      customerName: "Nandini S",
      customerPhone: "+919019055667",
      machineModel: "Singer Heavy Duty 4423",
      serialNumber: "HD4423-778120",
      issueDescription: "Needle breaking on thick fabric",
    });
    const [customer] = await db.select().from(customers).where(eq(customers.id, row.customerId));
    expect(customer.phone).toBe("+919019055667");

    const trailRes = await auditTrailGET(jsonRequest(`/api/tickets/${ticket.id}/audit-trail`, { cookie }), {
      params: { id: ticket.id },
    });
    const edits = (await trailRes.json()).entries.filter((e: { source: string }) => e.source === "details_edit");
    expect(edits).toHaveLength(1);
    expect(edits[0].description).toContain('Serial number: "OLD-SN" → "HD4423-778120"');
  });

  it("rejects clearing a required field", async () => {
    const { cookie, ticket } = await setup();
    const res = await patch(ticket.id, cookie, { customerName: "   " });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toEqual({ code: "missing_required_field", field: "customerName" });
  });

  it("rejects fields that aren't intake details", async () => {
    const { cookie, ticket } = await setup();
    const res = await patch(ticket.id, cookie, { status: "delivered" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_field");
  });

  it("locks the details once a ticket is Delivered or Cancelled", async () => {
    for (const status of ["delivered", "cancelled"] as const) {
      await resetDb();
      const { cookie, ticket } = await setup(status);
      const res = await patch(ticket.id, cookie, { issueDescription: "Changed" });
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("ticket_locked");
    }
  });

  it("forbids a Technician from editing", async () => {
    const { store, sm } = await setup();
    const tech = await createUser({ role: "technician", storeIds: [store.id], password: "Correct123!" });
    const assigned = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open", assignedTechnicianId: tech.id });
    const techCookie = await loginAs(tech.email, "Correct123!");
    const res = await patch(assigned.id, techCookie, { issueDescription: "Changed" });
    expect(res.status).toBe(403);
  });
});
