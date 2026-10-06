import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as ticketsPOST } from "@/app/api/tickets/route";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";

describe("Ticket intake with model number + serial number history lookup (User Story 1)", () => {
  beforeEach(resetDb);

  it("returns found: false when no prior closed ticket exists for the machine", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Priya Sharma",
          customerPhone: "+919876500001",
          machineModel: "LG-FHM1207ZDL",
          serialNumber: "SN-LG-FHM1207ZDL",
          issueDescription: "Not spinning",
        },
      }),
    );
    const body = await res.json();
    expect(body.history.found).toBe(false);
    expect(body.history.entries).toEqual([]);
  });

  it("returns found: true, store-scoped for a Service Manager, once a prior closed ticket exists", async () => {
    const storeA = await createStore("Store A");
    const storeB = await createStore("Store B");
    const smA = await createUser({ role: "service_manager", storeIds: [storeA.id], password: "Correct123!" });
    const smB = await createUser({ role: "service_manager", storeIds: [storeB.id], password: "Correct123!" });

    const priorTicket = await createTicket({
      storeId: storeA.id,
      createdBy: smA.id,
      machineModel: "LG-FHM1207ZDL",
      serialNumber: "SN-LG-FHM1207ZDL",
      customerPhone: "+919876500002",
      status: "completed",
    });

    const cookieA = await loginAs(smA.email, "Correct123!");
    const resA = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie: cookieA,
        body: {
          storeId: storeA.id,
          customerName: "Returning Customer",
          // A different phone (the machine is what matters); same model and serial,
          // different case/spacing.
          customerPhone: "+919811100000",
          machineModel: " lg-fhm1207zdl ",
          serialNumber: " sn-lg-fhm1207zdl ",
          issueDescription: "Different issue",
        },
      }),
    );
    const bodyA = await resA.json();
    expect(bodyA.history.found).toBe(true);
    expect(bodyA.history.entries.some((e: { id: string }) => e.id === priorTicket.id)).toBe(true);

    // Store-scoped: a Service Manager at a different store sees no history for the same machine.
    const cookieB = await loginAs(smB.email, "Correct123!");
    const resB = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie: cookieB,
        body: {
          storeId: storeB.id,
          customerName: "Returning Customer",
          customerPhone: "+919876500002",
          machineModel: "LG-FHM1207ZDL",
          serialNumber: "SN-LG-FHM1207ZDL",
          issueDescription: "Yet another issue",
        },
      }),
    );
    const bodyB = await resB.json();
    expect(bodyB.history.found).toBe(false);
  });

  it("shows cross-store history to an Admin", async () => {
    const storeA = await createStore("Store A");
    const storeB = await createStore("Store B");
    const smA = await createUser({ role: "service_manager", storeIds: [storeA.id] });
    const admin = await createUser({
      role: "admin",
      storeIds: [storeA.id, storeB.id],
      password: "Correct123!",
    });

    await createTicket({
      storeId: storeA.id,
      createdBy: smA.id,
      machineModel: "Whirlpool-X1",
      serialNumber: "SN-Whirlpool-X1",
      customerPhone: "+919876500004",
      status: "delivered",
    });

    const cookie = await loginAs(admin.email, "Correct123!");
    const res = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: storeB.id,
          customerName: "Cross Store Customer",
          customerPhone: "+919876500004",
          machineModel: "Whirlpool-X1",
          serialNumber: "SN-Whirlpool-X1",
          issueDescription: "New complaint",
        },
      }),
    );
    const body = await res.json();
    expect(body.history.found).toBe(true);
  });

  it("needs BOTH the model number and the serial number to match, whatever the phone number", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const prior = await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      machineModel: "Singer 4423",
      serialNumber: "HD4423-1",
      customerPhone: "+919876500010",
      status: "delivered",
    });
    // Still open: not history yet.
    await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      machineModel: "Singer 4423",
      serialNumber: "HD4423-1",
      customerPhone: "+919876500010",
      status: "in_progress",
    });

    const create = async (machineModel: string, serialNumber: string, customerPhone: string) => {
      const res = await ticketsPOST(
        jsonRequest("/api/tickets", {
          method: "POST",
          cookie,
          body: {
            storeId: store.id,
            customerName: "Someone",
            customerPhone,
            machineModel,
            serialNumber,
            issueDescription: "Check",
          },
        }),
      );
      return (await res.json()).history;
    };

    // Same model, different serial: another machine.
    expect((await create("Singer 4423", "HD4423-2", "+919876500010")).found).toBe(false);
    // Same serial, different model: another machine.
    expect((await create("Usha Janome", "HD4423-1", "+919876500010")).found).toBe(false);
    // Model and serial match: history, even from a different customer phone.
    const history = await create("SINGER 4423", "hd4423-1", "+919999900000");
    expect(history.found).toBe(true);
    expect(history.entries.map((e: { id: string }) => e.id)).toEqual([prior.id]);
    // No warning on service tickets.
    expect(history.warning).toBeUndefined();
  });

  it("resolves the customer to a single identity by phone and updates the name on a later ticket (FR-020)", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");
    const phone = "+919876500099";

    await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Original Name",
          customerPhone: phone,
          machineModel: "Model-Z",
          serialNumber: "SN-Model-Z",
          issueDescription: "First visit",
        },
      }),
    );

    const secondRes = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Corrected Name",
          customerPhone: phone,
          machineModel: "Model-Z",
          serialNumber: "SN-Model-Z",
          issueDescription: "Second visit",
        },
      }),
    );
    const secondBody = await secondRes.json();

    const firstTicketRows = await db.select().from(tickets).where(eq(tickets.customerPhone, phone));
    const firstTicket = firstTicketRows.find((t) => t.id !== secondBody.ticket.id)!;

    // The first ticket's own historical name is untouched by the later correction.
    expect(firstTicket.customerName).toBe("Original Name");
    // Both tickets resolve to the same canonical customer identity.
    expect(firstTicket.customerId).toBe(
      (await db.select().from(tickets).where(eq(tickets.id, secondBody.ticket.id)))[0].customerId,
    );
  });
});
