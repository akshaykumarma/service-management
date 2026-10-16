import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createDemoService, createDemoTicket, createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { waitFor } from "../helpers/wait-for";
import { resetMockWhatsApp } from "../helpers/whatsapp-mock-client";
import { POST as createPOST } from "@/app/api/demo-tickets/route";
import { PATCH as statusPATCH } from "@/app/api/demo-tickets/[id]/status/route";
import { GET as activityGET } from "@/app/api/demo-tickets/[id]/activity/route";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

const customerMessages = (demoTicketId: string) =>
  db
    .select()
    .from(notifications)
    .where(eq(notifications.demoTicketId, demoTicketId))
    .then((rows) => rows.filter((r) => r.type === "demo_created" || r.type === "demo_completed"));

describe("WhatsApp to the customer for demo tickets", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("sends the ticket number, demo service and demo date when a demo ticket is created", async () => {
    const store = await createStore({ name: "Shubha Sewing — Balepet", phone: "080-2345 6789" });
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");
    const service = await createDemoService({ name: "Home demo", unitCost: "1250.00" });
    const demoDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const res = await createPOST(
      jsonRequest("/api/demo-tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Kavya R",
          customerPhone: "+919448811223",
          machineModel: "Juki DDL-8700",
          serialNumber: "DDL87-1",
          invoiceNumber: "INV-1",
          demoServiceId: service.id,
          demoDate,
        },
      }),
    );
    expect(res.status).toBe(201);
    const { ticket } = await res.json();

    const [msg] = await waitFor(async () => {
      const rows = await customerMessages(ticket.id);
      return rows.length ? rows : null;
    }, { message: "expected a demo_created notification" });
    expect(msg).toMatchObject({ type: "demo_created", recipientPhone: "+919448811223", status: "sent", ticketId: null });
    expect(msg.renderedContent).toContain(ticket.ticketNumber);
    expect(msg.renderedContent).toContain("Home demo");
    expect(msg.renderedContent).toContain("Juki DDL-8700");
    expect(msg.renderedContent).toContain(demoDate.split("-").reverse().join("/"));
    expect(msg.renderedContent).toContain("080-2345 6789");
  });

  it("sends the total amount the first time the demo is completed, and not again after a re-completion", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const tech = await createUser({ role: "technician", storeIds: [store.id] });
    const service = await createDemoService({ name: "Home demo", unitCost: "1250.00" });
    const ticket = await createDemoTicket({
      storeId: store.id,
      createdBy: admin.id,
      demoServiceId: service.id,
      status: "assigned",
      assignedTechnicianId: tech.id,
      customerPhone: "+919448800000",
    });
    const cookie = await loginAs(admin.email, "Correct123!");
    const move = (toStatus: string, comment?: string) =>
      statusPATCH(
        jsonRequest(`/api/demo-tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus, comment } }),
        { params: { id: ticket.id } },
      );

    expect((await move("in_progress")).status).toBe(200);
    expect((await move("completed")).status).toBe(200);
    const [msg] = await waitFor(async () => {
      const rows = await customerMessages(ticket.id);
      return rows.length ? rows : null;
    }, { message: "expected a demo_completed notification" });
    expect(msg).toMatchObject({ type: "demo_completed", recipientPhone: "+919448800000", status: "sent" });
    expect(msg.renderedContent).toContain("has been completed");
    expect(msg.renderedContent).toContain("Total amount: ₹1,250.00");

    expect((await move("in_progress", "customer asked for another look")).status).toBe(200);
    expect((await move("completed")).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(await customerMessages(ticket.id)).toHaveLength(1);

    const activity = await (
      await activityGET(jsonRequest(`/api/demo-tickets/${ticket.id}/activity`, { cookie }), { params: { id: ticket.id } })
    ).json();
    expect(activity.entries.some((e: { description: string }) => e.description.startsWith("WhatsApp to customer: demo completed"))).toBe(true);
  });
});
