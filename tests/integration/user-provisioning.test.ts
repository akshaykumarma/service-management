import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, extractSessionCookie } from "../helpers/http";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { POST as usersPOST } from "@/app/api/auth/users/route";
import { PATCH as userPATCH } from "@/app/api/auth/users/[id]/route";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

async function loginAs(email: string, password: string) {
  const res = await loginPOST(jsonRequest("/api/auth/login", { method: "POST", body: { email, password } }));
  return extractSessionCookie(res)!;
}

describe("Super Admin user provisioning (User Story 4)", () => {
  beforeEach(resetDb);

  it("lets a Super Admin create a Store Service Manager who can then log in and see only their store", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore("Store A");
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const createRes = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New SM",
          email: "smprov@example.com",
          role: "service_manager",
          storeIds: [store.id],
          password: "NewHire#2026",
        },
      }),
    );
    expect(createRes.status).toBe(201);

    const smCookie = await loginAs("smprov@example.com", "NewHire#2026");
    const sessionRes = await sessionGET(jsonRequest("/api/auth/session", { cookie: smCookie }));
    const sessionBody = await sessionRes.json();
    expect(sessionBody.user.storeIds).toEqual([store.id]);
  });

  it("enforces one-store-only for a Service Manager on edit, same as on create", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const storeA = await createStore();
    const storeB = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [storeA.id] });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await userPATCH(
      jsonRequest(`/api/auth/users/${sm.id}`, {
        method: "PATCH",
        cookie,
        body: { storeIds: [storeA.id, storeB.id] },
      }),
      { params: { id: sm.id } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_store_count");
  });

  it("guards the last active Super Admin (FR-020): rejects deactivating the only one, allows it once a second exists", async () => {
    const superAdmin1 = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin1.email, "Correct123!");

    const rejectRes = await userPATCH(
      jsonRequest(`/api/auth/users/${superAdmin1.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: superAdmin1.id } },
    );
    expect(rejectRes.status).toBe(409);

    // A second active Super Admin exists now (seeded directly, as this API can't create one).
    const superAdmin2 = await createUser({ role: "super_admin" });

    const allowRes = await userPATCH(
      jsonRequest(`/api/auth/users/${superAdmin1.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: superAdmin1.id } },
    );
    expect(allowRes.status).toBe(200);
  });

  it("writes an audit_log row for every mutation (FR-018)", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const target = await createUser({ role: "admin" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    await userPATCH(
      jsonRequest(`/api/auth/users/${target.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: target.id } },
    );

    const rows = await db.select().from(auditLog);
    expect(rows.some((r) => r.entityId === target.id && r.actorId === superAdmin.id)).toBe(true);
  });
});
