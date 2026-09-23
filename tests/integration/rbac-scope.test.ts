import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, extractSessionCookie } from "../helpers/http";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { assertAccess, assertTicketAccess, requireSuperAdmin, AccessDeniedError } from "@/lib/auth/rbac";

describe("RBAC scoping (User Story 2)", () => {
  beforeEach(resetDb);

  it("denies a Store Service Manager access to a store they are not assigned to", async () => {
    const storeA = await createStore("Store A");
    const storeB = await createStore("Store B");
    const sm = await createUser({ role: "service_manager", storeIds: [storeA.id] });

    await expect(assertAccess(
      { id: sm.id, name: "x", email: sm.email, role: "service_manager", active: true },
      storeA.id,
    )).resolves.toBeUndefined();

    await expect(assertAccess(
      { id: sm.id, name: "x", email: sm.email, role: "service_manager", active: true },
      storeB.id,
    )).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("grants an Admin access to every store they are assigned to, and denies stores outside that set", async () => {
    const storeA = await createStore("Store A");
    const storeB = await createStore("Store B");
    const storeC = await createStore("Store C");
    const admin = await createUser({ role: "admin", storeIds: [storeA.id, storeB.id] });

    const adminSession = { id: admin.id, name: "x", email: admin.email, role: "admin" as const, active: true };
    await expect(assertAccess(adminSession, storeA.id)).resolves.toBeUndefined();
    await expect(assertAccess(adminSession, storeB.id)).resolves.toBeUndefined();
    await expect(assertAccess(adminSession, storeC.id)).rejects.toBeInstanceOf(AccessDeniedError);
  });

  it("grants a Super Admin access to any store with no assignment rows needed", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin" });

    await expect(assertAccess(
      { id: superAdmin.id, name: "x", email: superAdmin.email, role: "super_admin", active: true },
      store.id,
    )).resolves.toBeUndefined();
  });

  it("denies a direct-invocation bypass attempt the same way as a UI-hidden route (the check is not merely cosmetic)", async () => {
    const storeA = await createStore("Store A");
    const storeB = await createStore("Store B");
    const sm = await createUser({ role: "service_manager", storeIds: [storeA.id] });
    const smSession = { id: sm.id, name: "x", email: sm.email, role: "service_manager" as const, active: true };

    // Simulates a client crafting a request for a store never surfaced in their own UI.
    await expect(assertAccess(smSession, storeB.id)).rejects.toThrow();
  });

  it("rejects a non-Super-Admin from Super-Admin-only actions via requireSuperAdmin", async () => {
    const admin = await createUser({ role: "admin" });
    expect(() =>
      requireSuperAdmin({ id: admin.id, name: "x", email: admin.email, role: "admin", active: true }),
    ).toThrow(AccessDeniedError);
  });

  it("reflects correct storeIds via GET /api/auth/session for a multi-store Admin vs a single-store Service Manager", async () => {
    const storeA = await createStore("Store A");
    const storeB = await createStore("Store B");
    const admin = await createUser({ role: "admin", storeIds: [storeA.id, storeB.id], password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", storeIds: [storeA.id], password: "Correct123!" });

    const adminLogin = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: admin.email, password: "Correct123!" } }),
    );
    const adminCookie = extractSessionCookie(adminLogin)!;
    const adminSessionRes = await sessionGET(jsonRequest("/api/auth/session", { cookie: adminCookie }));
    const adminBody = await adminSessionRes.json();
    expect(adminBody.user.storeIds.sort()).toEqual([storeA.id, storeB.id].sort());

    const smLogin = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: sm.email, password: "Correct123!" } }),
    );
    const smCookie = extractSessionCookie(smLogin)!;
    const smSessionRes = await sessionGET(jsonRequest("/api/auth/session", { cookie: smCookie }));
    const smBody = await smSessionRes.json();
    expect(smBody.user.storeIds).toEqual([storeA.id]);
  });

  it("assertTicketAccess additionally restricts a Technician to only their assigned ticket, while every other role only needs store scope", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const technician = await createUser({ role: "technician", storeIds: [store.id] });
    const otherTechnician = await createUser({ role: "technician", storeIds: [store.id] });
    await createTicket({ storeId: store.id, createdBy: sm.id, assignedTechnicianId: technician.id });

    const technicianSession = {
      id: technician.id,
      name: "x",
      email: technician.email,
      role: "technician" as const,
      active: true,
    };
    const otherTechnicianSession = {
      id: otherTechnician.id,
      name: "x",
      email: otherTechnician.email,
      role: "technician" as const,
      active: true,
    };
    const smSession = { id: sm.id, name: "x", email: sm.email, role: "service_manager" as const, active: true };

    await expect(
      assertTicketAccess(technicianSession, { storeId: store.id, assignedTechnicianId: technician.id }),
    ).resolves.toBeUndefined();
    await expect(
      assertTicketAccess(otherTechnicianSession, { storeId: store.id, assignedTechnicianId: technician.id }),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    // Store scope alone is still sufficient for every other role — the ticket's
    // assignment is a Technician-only restriction.
    await expect(
      assertTicketAccess(smSession, { storeId: store.id, assignedTechnicianId: technician.id }),
    ).resolves.toBeUndefined();
  });
});
