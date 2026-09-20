import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { waitFor } from "../helpers/wait-for";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { db } from "@/lib/db/client";
import { notifications, stores } from "@/lib/db/schema";

describe("Automatic completion notification (User Story 1)", () => {
  beforeEach(resetDb);

  it("sends a WhatsApp completion message with bill/store details on the first Completed transition, and not again on a later re-Completed transition", async () => {
    const store = await createStore();
    await db.update(stores).set({ whatsappNumber: "+911234567890" }).where(eq(stores.id, store.id));
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({
      storeId: store.id,
      createdBy: admin.id,
      status: "in_progress",
      customerName: "Ravi Kumar",
      customerPhone: "+919999911111",
      machineModel: "Widget-9000",
    });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie,
        body: { toStatus: "completed", comment: null },
      }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(200);

    const notif = await waitFor(async () => {
      const rows = await db.select().from(notifications).where(eq(notifications.ticketId, ticket.id));
      return rows[0];
    }, { message: "expected a notifications row for the ticket's first Completed transition" });

    expect(notif.type).toBe("completion");
    expect(notif.recipientPhone).toBe("+919999911111");
    expect(notif.status).toBe("sent");
    expect(notif.renderedContent).toContain("Ravi Kumar");
    expect(notif.renderedContent).toContain(ticket.ticketNumber);
    expect(notif.renderedContent).toContain("Widget-9000");
    expect(notif.renderedContent).toContain("+911234567890");

    // Move backward (requires a comment) then forward again — re-entering Completed
    // must not send a second message (research.md §4).
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie,
        body: { toStatus: "on_hold", comment: "re-checking machine" },
      }),
      { params: { id: ticket.id } },
    );
    const res2 = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie,
        body: { toStatus: "completed", comment: null },
      }),
      { params: { id: ticket.id } },
    );
    expect(res2.status).toBe(200);

    // Let any (incorrect) second job land before asserting the count stayed at one.
    await new Promise((resolve) => setTimeout(resolve, 700));
    const allRows = await db.select().from(notifications).where(eq(notifications.ticketId, ticket.id));
    expect(allRows).toHaveLength(1);
  });
});
