import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createDemoTicket, createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as listGET } from "@/app/api/demo-tickets/route";
import { PATCH as statusPATCH } from "@/app/api/demo-tickets/[id]/status/route";
import { db } from "@/lib/db/client";
import { demoTickets, demoTicketStatusHistory } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const ids = async (res: Response) => (await res.json()).tickets.map((t: { id: string }) => t.id);

describe("Demo Board data and status moves (008 US2)", () => {
  beforeEach(resetDb);

  it("scopes the board like the Service Board: own store for a Service Manager, own assignments for a Technician", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const smA = await createUser({ role: "service_manager", storeIds: [storeA.id], password: "Correct123!" });
    const smB = await createUser({ role: "service_manager", storeIds: [storeB.id] });
    const tech = await createUser({ role: "technician", storeIds: [storeA.id], password: "Correct123!" });

    const mine = await createDemoTicket({ storeId: storeA.id, createdBy: smA.id, status: "assigned", assignedTechnicianId: tech.id });
    const unassigned = await createDemoTicket({ storeId: storeA.id, createdBy: smA.id });
    const foreign = await createDemoTicket({ storeId: storeB.id, createdBy: smB.id });

    const smIds = await ids(await listGET(jsonRequest("/api/demo-tickets", { cookie: await loginAs(smA.email, "Correct123!") })));
    expect(smIds.sort()).toEqual([mine.id, unassigned.id].sort());
    expect(smIds).not.toContain(foreign.id);

    const techIds = await ids(await listGET(jsonRequest("/api/demo-tickets", { cookie: await loginAs(tech.email, "Correct123!") })));
    expect(techIds).toEqual([mine.id]);
  });

  it("shows Completed demos only for the current month and hides Cancelled unless asked", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");
    const recent = await createDemoTicket({ storeId: store.id, createdBy: sm.id, status: "completed" });
    const old = await createDemoTicket({ storeId: store.id, createdBy: sm.id, status: "completed" });
    const cancelled = await createDemoTicket({ storeId: store.id, createdBy: sm.id, status: "cancelled" });
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await db.insert(demoTicketStatusHistory).values({ demoTicketId: old.id, fromStatus: "in_progress", toStatus: "completed", actorId: sm.id, createdAt: longAgo });
    await db.update(demoTickets).set({ updatedAt: longAgo }).where(eq(demoTickets.id, old.id));

    const visible = await ids(await listGET(jsonRequest("/api/demo-tickets", { cookie })));
    expect(visible).toContain(recent.id);
    expect(visible).not.toContain(old.id);
    expect(visible).not.toContain(cancelled.id);
    expect(await ids(await listGET(jsonRequest("/api/demo-tickets?includeCancelled=true", { cookie })))).toContain(cancelled.id);
  });

  it("applies the state machine on status moves, recording each one", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const tech = await createUser({ role: "technician", storeIds: [store.id] });
    const cookie = await loginAs(sm.email, "Correct123!");
    const fresh = await createDemoTicket({ storeId: store.id, createdBy: sm.id });
    const move = (id: string, body: unknown) =>
      statusPATCH(jsonRequest(`/api/demo-tickets/${id}/status`, { method: "PATCH", cookie, body }), { params: { id } });

    const noTech = await move(fresh.id, { toStatus: "assigned" });
    expect(noTech.status).toBe(400);
    expect((await noTech.json()).error.code).toBe("technician_required");

    const assigned = await createDemoTicket({ storeId: store.id, createdBy: sm.id, status: "assigned", assignedTechnicianId: tech.id });
    expect((await move(fresh.id, { toStatus: "completed" })).status).toBe(400); // no technician yet
    expect((await move(assigned.id, { toStatus: "in_progress" })).status).toBe(200);
    expect((await (await move(assigned.id, { toStatus: "assigned" })).json()).error.code).toBe("comment_required");
    expect((await move(assigned.id, { toStatus: "completed" })).status).toBe(200);
    expect((await move(assigned.id, { toStatus: "cancelled", comment: "x" })).status).toBe(400);

    const rows = await db.select().from(demoTicketStatusHistory).where(eq(demoTicketStatusHistory.demoTicketId, assigned.id));
    expect(rows.map((r) => r.toStatus)).toEqual(expect.arrayContaining(["in_progress", "completed"]));
  });

  it("404s a status move on a ticket outside the caller's scope", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const smA = await createUser({ role: "service_manager", storeIds: [storeA.id], password: "Correct123!" });
    const smB = await createUser({ role: "service_manager", storeIds: [storeB.id] });
    const foreign = await createDemoTicket({ storeId: storeB.id, createdBy: smB.id });
    const res = await statusPATCH(
      jsonRequest(`/api/demo-tickets/${foreign.id}/status`, { method: "PATCH", cookie: await loginAs(smA.email, "Correct123!"), body: { toStatus: "cancelled", comment: "x" } }),
      { params: { id: foreign.id } },
    );
    expect(res.status).toBe(404);
  });
});
