import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { db } from "@/lib/db/client";
import { statusHistory, tickets } from "@/lib/db/schema";

describe("Concurrent status change: last write wins (FR-019)", () => {
  beforeEach(resetDb);

  it("preserves both concurrent transitions in history, with the current status matching whichever committed second", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: admin.id, status: "in_progress" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const [resA, resB] = await Promise.all([
      statusPATCH(
        jsonRequest(`/api/tickets/${ticket.id}/status`, {
          method: "PATCH",
          cookie,
          body: { toStatus: "on_hold", comment: "concurrent A" },
        }),
        { params: { id: ticket.id } },
      ),
      statusPATCH(
        jsonRequest(`/api/tickets/${ticket.id}/status`, {
          method: "PATCH",
          cookie,
          body: { toStatus: "completed", comment: null },
        }),
        { params: { id: ticket.id } },
      ),
    ]);

    // Neither request is rejected for the mere fact of racing (no optimistic-lock conflict).
    expect([resA.status, resB.status].every((s) => s === 200)).toBe(true);

    const historyRows = await db.select().from(statusHistory).where(eq(statusHistory.ticketId, ticket.id));
    const toStatuses = historyRows.map((r) => r.toStatus).sort();
    expect(toStatuses).toEqual(["completed", "on_hold"].sort());

    const finalTicket = (await db.select().from(tickets).where(eq(tickets.id, ticket.id)))[0];
    expect(["on_hold", "completed"]).toContain(finalTicket.status);
  });
});
