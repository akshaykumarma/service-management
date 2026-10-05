import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createDemoTicket, createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { getReceivedMessages, resetMockWhatsApp } from "../helpers/whatsapp-mock-client";
import { waitFor } from "../helpers/wait-for";
import { PATCH as assignPATCH } from "@/app/api/demo-tickets/[id]/assign-technician/route";
import { GET as shortLinkGET } from "@/app/t/[code]/route";
import { db } from "@/lib/db/client";
import { demoTickets, notifications } from "@/lib/db/schema";

async function setup() {
  const store = await createStore();
  const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
  const ravi = await createUser({ role: "technician", storeIds: [store.id], name: "Ravi Kumar", phone: "+91 98450 11111", password: "Correct123!" });
  const imran = await createUser({ role: "technician", storeIds: [store.id], name: "Imran Pasha", phone: "+919845022222" });
  const noPhone = await createUser({ role: "technician", storeIds: [store.id], name: "No Phone" });
  const cookie = await loginAs(sm.email, "Correct123!");
  const ticket = await createDemoTicket({ storeId: store.id, createdBy: sm.id, customerName: "Kavya R" });
  const assign = (technicianId: string | null, asCookie = cookie) =>
    assignPATCH(jsonRequest(`/api/demo-tickets/${ticket.id}/assign-technician`, { method: "PATCH", cookie: asCookie, body: { technicianId } }), {
      params: { id: ticket.id },
    });
  return { store, sm, ravi, imran, noPhone, cookie, ticket, assign };
}

const demoMessages = async (ticketId: string) =>
  db.select().from(notifications).where(eq(notifications.demoTicketId, ticketId));

describe("assigning a demo ticket notifies the technician on WhatsApp (008 US3)", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("moves New → Assigned and sends one WhatsApp with the ticket's short URL", async () => {
    const { ravi, ticket, assign } = await setup();
    const res = await assign(ravi.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.whatsapp).toBe("queued");
    expect(body.ticket.status).toBe("assigned");

    const [row] = await waitFor(async () => {
      const rows = await demoMessages(ticket.id);
      return rows.length ? rows : null;
    });
    expect(row).toMatchObject({ type: "demo_assignment", recipientPhone: "+91 98450 11111", status: "sent", ticketId: null });
    expect(row.renderedContent).toContain(ticket.ticketNumber);
    expect(row.renderedContent).toContain("Kavya R");
    expect(row.renderedContent).toContain(`/t/${ticket.shortCode}`);

    const received = await getReceivedMessages();
    expect(received.some((m) => m.templateType === "demo_assignment" && m.params.ticket_url.endsWith(`/t/${ticket.shortCode}`))).toBe(true);
  });

  it("messages a new technician on reassignment, and nobody when the same one is saved again", async () => {
    const { ravi, imran, ticket, assign } = await setup();
    await assign(ravi.id);
    await waitFor(async () => (await demoMessages(ticket.id)).length === 1);

    expect((await (await assign(ravi.id)).json()).whatsapp).toBe("not_sent");
    expect((await (await assign(imran.id)).json()).whatsapp).toBe("queued");
    const rows = await waitFor(async () => {
      const r = await demoMessages(ticket.id);
      return r.length === 2 ? r : null;
    });
    expect(rows.map((r) => r.recipientPhone).sort()).toEqual(["+91 98450 11111", "+919845022222"]);
  });

  it("still assigns a technician without a WhatsApp number, and says so", async () => {
    const { noPhone, ticket, assign } = await setup();
    const body = await (await assign(noPhone.id)).json();
    expect(body.whatsapp).toBe("no_phone");
    expect(body.ticket.assignedTechnicianId).toBe(noPhone.id);
    await new Promise((r) => setTimeout(r, 300));
    expect(await demoMessages(ticket.id)).toHaveLength(0);
  });

  it("returns an Assigned ticket to New when the technician is removed, and rejects technicians from other stores or roles", async () => {
    const { sm, ravi, ticket, assign } = await setup();
    await assign(ravi.id);
    const cleared = await (await assign(null)).json();
    expect(cleared.ticket).toMatchObject({ status: "new", assignedTechnicianId: null });

    const otherStore = await createStore();
    const outsider = await createUser({ role: "technician", storeIds: [otherStore.id] });
    expect((await assign(outsider.id)).status).toBe(400);
    expect((await assign(sm.id)).status).toBe(400);
    const [row] = await db.select().from(demoTickets).where(eq(demoTickets.id, ticket.id));
    expect(row.assignedTechnicianId).toBeNull();
  });

  it("does not let a Technician assign", async () => {
    const { ravi, assign } = await setup();
    const techCookie = await loginAs(ravi.email, "Correct123!");
    expect((await assign(ravi.id, techCookie)).status).toBe(404); // not assigned yet → not visible to them
  });

  it("resolves the short link to the ticket, via login when signed out", async () => {
    const { cookie, ticket } = await setup();
    const signedIn = await shortLinkGET(jsonRequest(`/t/${ticket.shortCode}`, { cookie }), { params: { code: ticket.shortCode } });
    expect(signedIn.status).toBe(302);
    expect(signedIn.headers.get("location")).toBe(`/demo-tickets/${ticket.id}`);

    const signedOut = await shortLinkGET(jsonRequest(`/t/${ticket.shortCode}`), { params: { code: ticket.shortCode } });
    expect(signedOut.headers.get("location")).toBe(`/login?next=${encodeURIComponent(`/demo-tickets/${ticket.id}`)}`);

    expect((await shortLinkGET(jsonRequest("/t/nope1234"), { params: { code: "nope1234" } })).status).toBe(404);
  });
});
