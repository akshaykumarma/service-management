import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";

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

  it("denies a Store Service Manager a backward transition out of Delivered even with a comment, but allows an Admin", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "delivered" });

    const smCookie = await loginAs(sm.email, "Correct123!");
    const smAttempt = await patchStatus(ticket.id, smCookie, "completed", "oops");
    expect(smAttempt.status).toBe(403);
    expect((await smAttempt.json()).error.code).toBe("role_not_permitted");

    const adminCookie = await loginAs(admin.email, "Correct123!");
    const adminAttempt = await patchStatus(ticket.id, adminCookie, "completed", "correcting a mistaken OTP confirmation");
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
