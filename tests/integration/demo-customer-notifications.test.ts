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
import { GET as invoiceGET } from "@/app/api/invoices/[token]/route";
import { GET as demoInvoiceGET } from "@/app/api/demo-tickets/[id]/invoice/route";
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
    // The response carries everything saved, for the "ticket created" screen.
    expect(ticket).toMatchObject({
      status: "new",
      storeName: "Shubha Sewing — Balepet",
      customerName: "Kavya R",
      customerPhone: "+919448811223",
      machineModel: "Juki DDL-8700",
      serialNumber: "DDL87-1",
      invoiceNumber: "INV-1",
      demoServiceName: "Home demo",
      demoServicePrice: "1250.00",
      demoDate,
    });

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
    for (const line of [
      "*Model number:* Juki DDL-8700",
      "*Serial number:* DDL87-1",
      "*Invoice number:* INV-1",
      "*Demo service:* Home demo (₹1,250.00)",
      `*Demo date:* ${demoDate.split("-").reverse().join("/")}`,
      "*Phone:* +919448811223",
      "*Received on:* ",
    ]) {
      expect(msg.renderedContent).toContain(line);
    }
  });

  it("sends who gave the demo, the total amount and a working invoice link the first time the demo is completed, once", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const tech = await createUser({ role: "technician", storeIds: [store.id], name: "Ravi Kumar", phone: "+919811122233" });
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
    expect(msg.renderedContent).toContain("*Total amount:* ₹1,250.00");
    expect(msg.renderedContent).toContain("*Demoed by:* Ravi Kumar");
    expect(msg.renderedContent).toContain("*Technician phone:* +919811122233");
    expect(msg.renderedContent).toContain(`*Serial number:* ${ticket.serialNumber}`);

    // The invoice link opens the demo's invoice PDF, without logging in.
    const token = msg.renderedContent.match(/\/api\/invoices\/([\w-]+)/)![1];
    const pdf = await invoiceGET(jsonRequest(`/api/invoices/${token}`), { params: { token } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");

    // Staff can download the same invoice from the ticket page.
    const staffPdf = await demoInvoiceGET(jsonRequest(`/api/demo-tickets/${ticket.id}/invoice`, { cookie }), {
      params: { id: ticket.id },
    });
    expect(staffPdf.status).toBe(200);

    expect((await move("in_progress", "customer asked for another look")).status).toBe(200);
    expect((await move("completed")).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(await customerMessages(ticket.id)).toHaveLength(1);

    const activity = await (
      await activityGET(jsonRequest(`/api/demo-tickets/${ticket.id}/activity`, { cookie }), { params: { id: ticket.id } })
    ).json();
    const completedEntry = activity.entries.find((e: { description: string }) =>
      e.description.startsWith("WhatsApp to customer: demo completed"),
    );
    // TEMPORARY: with the message's full text.
    expect(completedEntry.detail).toBe(msg.renderedContent);
  });

  it("only offers the staff invoice download once the demo is completed", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createDemoTicket({ storeId: store.id, createdBy: admin.id });
    const res = await demoInvoiceGET(
      jsonRequest(`/api/demo-tickets/${ticket.id}/invoice`, { cookie: await loginAs(admin.email, "Correct123!") }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(409);
  });
});
