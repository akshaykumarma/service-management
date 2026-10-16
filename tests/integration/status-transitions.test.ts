import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { statusHistory } from "@/lib/db/schema";

async function patchStatus(ticketId: string, cookie: string, toStatus: string, comment?: string) {
  return statusPATCH(
    jsonRequest(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      cookie,
      body: { toStatus, comment: comment ?? null },
    }),
    { params: { id: ticketId } },
  );
}

describe("Status lifecycle transitions (User Story 2)", () => {
  beforeEach(resetDb);

  it("allows forward transitions with no comment required, except entering On Hold", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const toInProgress = await patchStatus(ticket.id, cookie, "in_progress");
    expect(toInProgress.status).toBe(200);

    const toCompleted = await patchStatus(ticket.id, cookie, "completed");
    expect(toCompleted.status).toBe(200);

    const toDelivered = await patchStatus(ticket.id, cookie, "delivered");
    expect(toDelivered.status).toBe(200);
  });

  it("requires a comment to enter On Hold regardless of direction", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const withoutComment = await patchStatus(ticket.id, cookie, "on_hold");
    expect(withoutComment.status).toBe(400);
    expect((await withoutComment.json()).error.code).toBe("comment_required");

    const withComment = await patchStatus(ticket.id, cookie, "on_hold", "waiting on part");
    expect(withComment.status).toBe(200);
  });

  it("requires a comment for a backward transition", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "completed" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const withoutComment = await patchStatus(ticket.id, cookie, "in_progress");
    expect(withoutComment.status).toBe(400);
    expect((await withoutComment.json()).error.code).toBe("comment_required");

    const withComment = await patchStatus(ticket.id, cookie, "in_progress", "correcting a mistake");
    expect(withComment.status).toBe(200);
  });

  it("lets a Store Service Manager move a ticket back out of Delivered with a comment (to Completed or In Progress)", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const smCookie = await loginAs(sm.email, "Correct123!");

    const toCompleted = await createTicket({ storeId: store.id, createdBy: sm.id, status: "delivered" });
    const noComment = await patchStatus(toCompleted.id, smCookie, "completed");
    expect(noComment.status).toBe(400);
    expect((await noComment.json()).error.code).toBe("comment_required");
    const withComment = await patchStatus(toCompleted.id, smCookie, "completed", "customer brought it back, belt slipping");
    expect(withComment.status).toBe(200);
    const history = await db.select().from(statusHistory).where(eq(statusHistory.ticketId, toCompleted.id));
    expect(history.some((h) => h.fromStatus === "delivered" && h.toStatus === "completed" && h.actorId === sm.id && h.comment === "customer brought it back, belt slipping")).toBe(true);

    const toInProgress = await createTicket({ storeId: store.id, createdBy: sm.id, status: "delivered" });
    expect((await patchStatus(toInProgress.id, smCookie, "in_progress", "rework needed")).status).toBe(200);
  });

  it("still denies a Technician a backward transition out of Delivered, and an Admin may do it", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const tech = await createUser({ role: "technician", storeIds: [store.id], password: "Correct123!" });
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "delivered", assignedTechnicianId: tech.id });

    const techAttempt = await patchStatus(ticket.id, await loginAs(tech.email, "Correct123!"), "completed", "oops");
    expect(techAttempt.status).toBe(403);
    expect((await techAttempt.json()).error.code).toBe("role_not_permitted");

    const adminAttempt = await patchStatus(ticket.id, await loginAs(admin.email, "Correct123!"), "completed", "correcting a mistaken OTP confirmation");
    expect(adminAttempt.status).toBe(200);
  });

  it("rejects an invalid transition (e.g. out of a terminal Cancelled ticket)", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: admin.id, status: "cancelled" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await patchStatus(ticket.id, cookie, "open", "reopen attempt");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_transition");
  });

  it("returns the inserted history entry with actor and timestamp on every successful transition", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "open" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await patchStatus(ticket.id, cookie, "in_progress");
    const body = await res.json();
    expect(body.historyEntry.fromStatus).toBe("open");
    expect(body.historyEntry.toStatus).toBe("in_progress");
    expect(body.historyEntry.actorId).toBe(sm.id);
    expect(body.historyEntry.createdAt).toBeTruthy();
  });
});
