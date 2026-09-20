import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, extractSessionCookie } from "../helpers/http";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { PATCH as userPATCH } from "@/app/api/auth/users/[id]/route";

async function loginAs(email: string, password: string) {
  const res = await loginPOST(jsonRequest("/api/auth/login", { method: "POST", body: { email, password } }));
  return extractSessionCookie(res)!;
}

describe("Live revocation, not cached at login (FR-019)", () => {
  beforeEach(resetDb);

  it("denies a deactivated user's very next request without them ever logging out", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", password: "Correct123!", storeIds: [store.id] });

    const smCookie = await loginAs(sm.email, "Correct123!");
    const beforeRes = await sessionGET(jsonRequest("/api/auth/session", { cookie: smCookie }));
    expect(beforeRes.status).toBe(200);

    const adminCookie = await loginAs(superAdmin.email, "Correct123!");
    const deactivateRes = await userPATCH(
      jsonRequest(`/api/auth/users/${sm.id}`, { method: "PATCH", cookie: adminCookie, body: { active: false } }),
      { params: { id: sm.id } },
    );
    expect(deactivateRes.status).toBe(200);

    // Without logging out, the deactivated user's original session must fail immediately.
    const afterRes = await sessionGET(jsonRequest("/api/auth/session", { cookie: smCookie }));
    expect(afterRes.status).toBe(401);
  });
});
