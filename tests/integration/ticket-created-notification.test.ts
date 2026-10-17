import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { waitFor } from "../helpers/wait-for";
import { getReceivedMessages, resetMockWhatsApp, setPhoneFailure } from "../helpers/whatsapp-mock-client";
import { POST as ticketsPOST } from "@/app/api/tickets/route";
import { GET as auditTrailGET } from "@/app/api/tickets/[id]/audit-trail/route";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

let lastCookie = "";

async function createServiceTicket(customerPhone: string) {
  const store = await createStore({ name: "Shubha Sewing — Balepet", phone: "080-2345 6789" });
  const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
  const cookie = await loginAs(sm.email, "Correct123!");
  lastCookie = cookie;
  const res = await ticketsPOST(
    jsonRequest("/api/tickets", {
      method: "POST",
      cookie,
      body: {
        storeId: store.id,
        customerName: "Lakshmi N",
        customerPhone,
        machineModel: "Usha Janome Allure",
        customerAltPhone: "+919845000001",
        serialNumber: "UJA-77821",
        issueDescription: "Thread keeps breaking",
        estimatedPickupDate: "2026-12-05",
      },
    }),
  );
  return res;
}

describe("WhatsApp to the customer when a service ticket is created", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("sends one acknowledgement with the ticket number, model and store details", async () => {
    const res = await createServiceTicket("+919845011223");
    expect(res.status).toBe(201);
    const { ticket } = await res.json();

    const notif = await waitFor(async () => {
      const rows = await db.select().from(notifications).where(eq(notifications.ticketId, ticket.id));
      return rows[0];
    }, { message: "expected a ticket_created notification" });

    expect(notif).toMatchObject({ type: "ticket_created", recipientPhone: "+919845011223", status: "sent" });
    expect(notif.renderedContent).toContain("Lakshmi N");
    expect(notif.renderedContent).toContain(ticket.ticketNumber);
    expect(notif.renderedContent).toContain("Usha Janome Allure");
    expect(notif.renderedContent).toContain("Shubha Sewing — Balepet");
    expect(notif.renderedContent).toContain("080-2345 6789");
    // Everything entered at intake is repeated back.
    for (const line of [
      `*Ticket number:* ${ticket.ticketNumber}`,
      "*Machine model:* Usha Janome Allure",
      "*Serial number:* UJA-77821",
      "*Problem reported:* Thread keeps breaking",
      "*Phone:* +919845011223",
      "*Alternate phone:* +919845000001",
      "*Expected ready by:* 05/12/2026",
      "*Received on:* ",
    ]) {
      expect(notif.renderedContent).toContain(line);
    }

    const sent = (await getReceivedMessages()).filter((m) => m.to === "+919845011223");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ templateType: "ticket_created", params: { ticket_id: ticket.ticketNumber } });

    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(await db.select().from(notifications).where(eq(notifications.ticketId, ticket.id))).toHaveLength(1);

    // TEMPORARY: the ticket's own Activity shows the message and its full text.
    const trail = await (
      await auditTrailGET(jsonRequest(`/api/tickets/${ticket.id}/audit-trail`, { cookie: lastCookie }), {
        params: { id: ticket.id },
      })
    ).json();
    const entry = trail.entries.find((e: { source: string }) => e.source === "notification");
    expect(entry.description).toContain("Ticket created WhatsApp notification sent to +919845011223");
    expect(entry.detail).toBe(notif.renderedContent);
  });

  it("still creates the ticket when WhatsApp fails, and records the failed message", async () => {
    await setPhoneFailure("+919845099999", true);
    const res = await createServiceTicket("+919845099999");
    expect(res.status).toBe(201);
    const { ticket } = await res.json();

    const notif = await waitFor(async () => {
      const rows = await db.select().from(notifications).where(eq(notifications.ticketId, ticket.id));
      return rows[0];
    }, { message: "expected a failed ticket_created notification", timeoutMs: 10_000 });
    expect(notif).toMatchObject({ type: "ticket_created", status: "failed" });
    await setPhoneFailure("+919845099999", false);
  });
});
