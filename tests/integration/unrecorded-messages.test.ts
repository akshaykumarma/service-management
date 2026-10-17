import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createDemoTicket, createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as auditTrailGET } from "@/app/api/tickets/[id]/audit-trail/route";
import { GET as demoActivityGET } from "@/app/api/demo-tickets/[id]/activity/route";
import { GET as adminActivityGET } from "@/app/api/admin/activity/route";
import { db } from "@/lib/db/client";

// TEMPORARY feature (remove with the WhatsApp message log before production — CLAUDE.md).
// A queued message the worker never managed to record (here: a job pg-boss marked failed)
// must still show, with its text, wherever messages are listed.
async function insertFailedJob(data: Record<string, unknown>) {
  await db.execute(sql`
    INSERT INTO pgboss.job (name, data, state)
    VALUES ('send-whatsapp-message', ${JSON.stringify(data)}::jsonb, 'failed')
  `);
}

describe("WhatsApp messages that never got a notifications record", () => {
  beforeEach(resetDb);

  it("are shown in the service and demo ticket Activity and the Super Admin feed", async () => {
    const store = await createStore();
    const sa = await createUser({ role: "super_admin", password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sa.id });
    const demo = await createDemoTicket({ storeId: store.id, createdBy: sa.id });
    await insertFailedJob({
      ticketId: ticket.id,
      type: "ticket_created",
      recipientPhone: "+919800000009",
      storedContent: "Hi Asha, we have received your machine.",
    });
    await insertFailedJob({
      ticketId: null,
      demoTicketId: demo.id,
      type: "demo_created",
      recipientPhone: "+919800000010",
      storedContent: "Hi Kavya, your demo has been booked.",
    });
    const cookie = await loginAs(sa.email, "Correct123!");

    const trail = await (
      await auditTrailGET(jsonRequest(`/api/tickets/${ticket.id}/audit-trail`, { cookie }), { params: { id: ticket.id } })
    ).json();
    expect(trail.entries).toContainEqual(
      expect.objectContaining({
        source: "notification",
        description: "Ticket created WhatsApp notification could not be sent or recorded to +919800000009",
        detail: "Hi Asha, we have received your machine.",
      }),
    );

    const demoActivity = await (
      await demoActivityGET(jsonRequest(`/api/demo-tickets/${demo.id}/activity`, { cookie }), { params: { id: demo.id } })
    ).json();
    expect(demoActivity.entries).toContainEqual(
      expect.objectContaining({ detail: "Hi Kavya, your demo has been booked." }),
    );

    const admin = await (await adminActivityGET(jsonRequest("/api/admin/activity?kind=message", { cookie }))).json();
    expect(admin.entries.map((e: { detail: string }) => e.detail)).toEqual(
      expect.arrayContaining(["Hi Asha, we have received your machine.", "Hi Kavya, your demo has been booked."]),
    );
  });
});
