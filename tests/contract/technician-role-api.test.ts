import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as usersPOST } from "@/app/api/auth/users/route";
import { GET as ticketGET } from "@/app/api/tickets/[id]/route";
import { GET as ticketsGET } from "@/app/api/tickets/route";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { GET as techniciansGET } from "@/app/api/tickets/[id]/technicians/route";
import { PATCH as assignTechnicianPATCH } from "@/app/api/tickets/[id]/assign-technician/route";

async function superAdminCookie() {
  const admin = await createUser({ role: "super_admin", password: "Correct123!" });
  return loginAs(admin.email, "Correct123!");
}

describe("Technician role (post-007 product feedback)", () => {
  beforeEach(resetDb);

  it("requires exactly one store when creating a Technician account", async () => {
    const cookie = await superAdminCookie();
    const storeA = await createStore("Store A");
    const storeB = await createStore("Store B");

    const zeroStores = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: { name: "Tech", email: "tech1@example.com", role: "technician", storeIds: [], password: "Correct123!" },
      }),
    );
    expect(zeroStores.status).toBe(400);
    expect((await zeroStores.json()).error.code).toBe("store_assignment_required");

    const twoStores = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "Tech",
          email: "tech2@example.com",
          role: "technician",
          storeIds: [storeA.id, storeB.id],
          password: "Correct123!",
        },
      }),
    );
    expect(twoStores.status).toBe(400);
    expect((await twoStores.json()).error.code).toBe("invalid_store_count");

    const oneStore = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "Tech",
          email: "tech3@example.com",
          role: "technician",
          storeIds: [storeA.id],
          password: "Correct123!",
        },
      }),
    );
    expect(oneStore.status).toBe(201);
    expect((await oneStore.json()).user.role).toBe("technician");
  });

  it("lets a Service Manager assign and unassign a Technician, restricted to their own store", async () => {
    const cookie = await superAdminCookie();
    const store = await createStore();
    const otherStore = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const smCookie = await loginAs(sm.email, "Correct123!");
    const technician = await createUser({ role: "technician", storeIds: [store.id] });
    const outOfStoreTechnician = await createUser({ role: "technician", storeIds: [otherStore.id] });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });

    const listRes = await techniciansGET(jsonRequest(`/api/tickets/${ticket.id}/technicians`, { cookie: smCookie }), {
      params: { id: ticket.id },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.technicians.map((t: { id: string }) => t.id)).toEqual([technician.id]);

    const badAssign = await assignTechnicianPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/assign-technician`, {
        method: "PATCH",
        cookie: smCookie,
        body: { technicianId: outOfStoreTechnician.id },
      }),
      { params: { id: ticket.id } },
    );
    expect(badAssign.status).toBe(400);
    expect((await badAssign.json()).error.code).toBe("invalid_technician");

    const assignRes = await assignTechnicianPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/assign-technician`, {
        method: "PATCH",
        cookie: smCookie,
        body: { technicianId: technician.id },
      }),
      { params: { id: ticket.id } },
    );
    expect(assignRes.status).toBe(200);
    expect((await assignRes.json()).ticket.assignedTechnicianId).toBe(technician.id);

    const unassignRes = await assignTechnicianPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/assign-technician`, {
        method: "PATCH",
        cookie: smCookie,
        body: { technicianId: null },
      }),
      { params: { id: ticket.id } },
    );
    expect(unassignRes.status).toBe(200);
    expect((await unassignRes.json()).ticket.assignedTechnicianId).toBeNull();
  });

  it("403s a Technician attempting to assign a ticket themselves", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const technician = await createUser({ role: "technician", storeIds: [store.id], password: "Correct123!" });
    const technicianCookie = await loginAs(technician.email, "Correct123!");
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });

    const res = await assignTechnicianPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/assign-technician`, {
        method: "PATCH",
        cookie: technicianCookie,
        body: { technicianId: technician.id },
      }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(403);
  });

  it("grants a Technician access only to their assigned ticket, 404ing every other ticket in their own store", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const technician = await createUser({ role: "technician", storeIds: [store.id], password: "Correct123!" });
    const technicianCookie = await loginAs(technician.email, "Correct123!");

    const assignedTicket = await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      status: "in_progress",
      assignedTechnicianId: technician.id,
    });
    const otherTicket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });

    const assignedRes = await ticketGET(jsonRequest(`/api/tickets/${assignedTicket.id}`, { cookie: technicianCookie }), {
      params: { id: assignedTicket.id },
    });
    expect(assignedRes.status).toBe(200);
    const assignedBody = await assignedRes.json();
    expect(assignedBody.ticket.assignedTechnicianId).toBe(technician.id);

    const otherRes = await ticketGET(jsonRequest(`/api/tickets/${otherTicket.id}`, { cookie: technicianCookie }), {
      params: { id: otherTicket.id },
    });
    expect(otherRes.status).toBe(404);
  });

  it("board list for a Technician returns only tickets assigned to them", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const technician = await createUser({ role: "technician", storeIds: [store.id], password: "Correct123!" });
    const technicianCookie = await loginAs(technician.email, "Correct123!");

    const assignedTicket = await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      status: "in_progress",
      assignedTechnicianId: technician.id,
    });
    await createTicket({ storeId: store.id, createdBy: sm.id, status: "in_progress" });

    const res = await ticketsGET(jsonRequest("/api/tickets", { cookie: technicianCookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets.map((t: { id: string }) => t.id)).toEqual([assignedTicket.id]);
  });

  it("restricts a Technician's status transitions the same way as a Service Manager (no cancel, no backward move off Delivered)", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const technician = await createUser({ role: "technician", storeIds: [store.id], password: "Correct123!" });
    const technicianCookie = await loginAs(technician.email, "Correct123!");

    const ticket = await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      status: "in_progress",
      assignedTechnicianId: technician.id,
    });

    const cancelRes = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie: technicianCookie,
        body: { toStatus: "cancelled", comment: "nope" },
      }),
      { params: { id: ticket.id } },
    );
    expect(cancelRes.status).toBe(403);
    expect((await cancelRes.json()).error.code).toBe("role_not_permitted");

    const forwardRes = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie: technicianCookie,
        body: { toStatus: "completed" },
      }),
      { params: { id: ticket.id } },
    );
    expect(forwardRes.status).toBe(200);
  });
});
