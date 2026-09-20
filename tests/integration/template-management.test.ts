import { beforeEach, describe, expect, it } from "vitest";
import { eq, and, desc } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { getReceivedMessages, resetMockWhatsApp } from "../helpers/whatsapp-mock-client";
import { waitFor } from "../helpers/wait-for";
import { PATCH as templatePATCH } from "@/app/api/templates/[type]/route";
import { POST as testSendPOST } from "@/app/api/templates/[type]/test-send/route";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { db } from "@/lib/db/client";
import { messageTemplates, notifications } from "@/lib/db/schema";

describe("Message template management (User Story 6)", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("keeps a pending edit from affecting real sends until it is approved (an out-of-band step this codebase never triggers itself)", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const newBody = "Thanks {{customer_name}}, your machine {{machine_model}} is ready!! Ticket {{ticket_id}}.";
    await templatePATCH(
      jsonRequest("/api/templates/completion", { method: "PATCH", cookie, body: { body: newBody } }),
      { params: { type: "completion" } },
    );

    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const smCookie = await loginAs(sm.email, "Correct123!");

    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie: smCookie, body: { toStatus: "completed", comment: null } }),
      { params: { id: ticket.id } },
    );

    const notif = await waitFor(async () => {
      const rows = await db.select().from(notifications).where(eq(notifications.ticketId, ticket.id));
      return rows[0];
    });
    // Still the built-in default, not the pending edit.
    expect(notif.renderedContent).not.toContain("!!");
    expect(notif.renderedContent).toContain("ready for pickup");

    // Simulate Meta's out-of-band approval completing (nothing in this codebase does
    // this itself — research.md §5/quickstart.md's own "Important" note).
    const [pendingRow] = await db
      .select()
      .from(messageTemplates)
      .where(and(eq(messageTemplates.type, "completion"), eq(messageTemplates.approvalStatus, "pending")))
      .orderBy(desc(messageTemplates.updatedAt))
      .limit(1);
    await db.update(messageTemplates).set({ approvalStatus: "approved" }).where(eq(messageTemplates.id, pendingRow.id));

    const ticket2 = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket2.id}/status`, { method: "PATCH", cookie: smCookie, body: { toStatus: "completed", comment: null } }),
      { params: { id: ticket2.id } },
    );
    const notif2 = await waitFor(async () => {
      const rows = await db.select().from(notifications).where(eq(notifications.ticketId, ticket2.id));
      return rows[0];
    });
    expect(notif2.renderedContent).toContain("ready!!");
  });

  it("test-sends the approved template for real (usePending omitted), recording a ticketless notification", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");
    const phone = "+919222222222";

    const res = await testSendPOST(
      jsonRequest("/api/templates/completion/test-send", { method: "POST", cookie, body: { phone } }),
      { params: { type: "completion" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.renderedContent).toContain("Sample Customer");

    const received = await getReceivedMessages();
    expect(received.some((m) => m.to === phone)).toBe(true);

    const rows = await db.select().from(notifications).where(eq(notifications.recipientPhone, phone));
    expect(rows).toHaveLength(1);
    expect(rows[0].ticketId).toBeNull();
    expect(rows[0].status).toBe("sent");
  });
});
