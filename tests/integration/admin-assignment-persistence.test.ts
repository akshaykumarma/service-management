import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as storeAdminsPOST } from "@/app/api/admin/stores/[id]/admins/route";
import { PATCH as storePATCH } from "@/app/api/admin/stores/[id]/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";

describe("Admin-store assignment persists across store deactivation (User Story 3 + FR-012)", () => {
  beforeEach(resetDb);

  it("assigns an Admin, survives a deactivate/reactivate cycle unchanged, and reflects immediately without re-login", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const store = await createStore({ active: true });
    const admin = await createUser({ role: "admin", password: "Correct123!" });
    const adminCookie = await loginAs(admin.email, "Correct123!");

    await storeAdminsPOST(
      jsonRequest(`/api/admin/stores/${store.id}/admins`, { method: "POST", cookie: superAdminCookie, body: { userId: admin.id } }),
      { params: { id: store.id } },
    );

    const sessionBefore = await sessionGET(jsonRequest("/api/auth/session", { cookie: adminCookie }));
    expect((await sessionBefore.json()).user.storeIds).toContain(store.id);

    await storePATCH(
      jsonRequest(`/api/admin/stores/${store.id}`, { method: "PATCH", cookie: superAdminCookie, body: { active: false } }),
      { params: { id: store.id } },
    );

    const sessionDuringDeactivation = await sessionGET(jsonRequest("/api/auth/session", { cookie: adminCookie }));
    expect((await sessionDuringDeactivation.json()).user.storeIds).toContain(store.id);

    await storePATCH(
      jsonRequest(`/api/admin/stores/${store.id}`, { method: "PATCH", cookie: superAdminCookie, body: { active: true } }),
      { params: { id: store.id } },
    );

    const sessionAfterReactivation = await sessionGET(jsonRequest("/api/auth/session", { cookie: adminCookie }));
    expect((await sessionAfterReactivation.json()).user.storeIds).toContain(store.id);
  });
});
