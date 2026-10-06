import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { asc } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createDemoTicket, createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { GET as activityGET } from "@/app/api/admin/activity/route";
import { db } from "@/lib/db/client";
import { loginEvents } from "@/lib/db/schema";
import { loginAttempts } from "@/lib/auth/lockout";

function loginRequest(email: string, password: string) {
  return new NextRequest(new URL("/api/auth/login", "http://localhost:3000"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
    },
    body: JSON.stringify({ email, password }),
  });
}

async function events() {
  return db.select().from(loginEvents).orderBy(asc(loginEvents.createdAt));
}

describe("Super Admin login & activity", () => {
  beforeEach(async () => {
    await resetDb();
    loginAttempts.clear();
  });

  it("records successful, failed, unknown-user, deactivated and locked sign-ins with IP and device", async () => {
    const user = await createUser({ email: "sm@example.com", password: "Correct123!" });
    const inactive = await createUser({ email: "gone@example.com", password: "Correct123!", active: false });

    expect((await loginPOST(loginRequest("SM@example.com", "Correct123!"))).status).toBe(200);
    expect((await loginPOST(loginRequest("sm@example.com", "wrong"))).status).toBe(401);
    expect((await loginPOST(loginRequest("nobody@example.com", "wrong"))).status).toBe(401);
    expect((await loginPOST(loginRequest(inactive.email, "Correct123!"))).status).toBe(403);

    const rows = await events();
    expect(rows.map((r) => [r.outcome, r.userId, r.identifier])).toEqual([
      ["success", user.id, "sm@example.com"],
      ["failed", user.id, "sm@example.com"],
      ["failed", null, "nobody@example.com"],
      ["deactivated", inactive.id, "gone@example.com"],
    ]);
    expect(rows[0].ipAddress).toBe("203.0.113.7");
    expect(rows[0].userAgent).toContain("Android");

    for (let i = 0; i < 5; i++) await loginPOST(loginRequest("sm@example.com", "wrong"));
    expect((await loginPOST(loginRequest("sm@example.com", "Correct123!"))).status).toBe(423);
    const last = (await events()).at(-1)!;
    expect(last.outcome).toBe("locked");
    expect(last.userId).toBe(user.id);
  });

  it("records sign-out against the session's user", async () => {
    const user = await createUser({ email: "out@example.com", password: "Correct123!" });
    const cookie = await loginAs(user.email, "Correct123!");
    expect((await logoutPOST(jsonRequest("/api/auth/logout", { method: "POST", cookie }))).status).toBe(204);
    const rows = await events();
    expect(rows.map((r) => r.outcome)).toEqual(["success", "logout"]);
    expect(rows[1].userId).toBe(user.id);
  });

  it("is available to Super Admins only", async () => {
    const store = await createStore();
    for (const role of ["admin", "service_manager", "technician"] as const) {
      const u = await createUser({ role, storeIds: [store.id], password: "Correct123!" });
      const res = await activityGET(jsonRequest("/api/admin/activity", { cookie: await loginAs(u.email, "Correct123!") }));
      expect(res.status).toBe(403);
    }
    expect((await activityGET(jsonRequest("/api/admin/activity"))).status).toBe(401);
  });

  it("lists logins and ticket changes with filters, plus who is signed in now", async () => {
    const store = await createStore();
    const sa = await createUser({ role: "super_admin", name: "Sam Super", password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", name: "Mia Manager", storeIds: [store.id], password: "Correct123!" });
    await createTicket({ storeId: store.id, createdBy: sm.id });
    await createDemoTicket({ storeId: store.id, createdBy: sm.id });
    await loginAs(sm.email, "Correct123!");
    const cookie = await loginAs(sa.email, "Correct123!");

    const res = await activityGET(jsonRequest("/api/admin/activity", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const descriptions: string[] = body.entries.map((e: { description: string }) => e.description);
    expect(descriptions.filter((d) => d === "Signed in")).toHaveLength(2);
    expect(descriptions.some((d) => /^Created demo ticket DEMO-TEST-/.test(d))).toBe(true);
    expect(body.signedIn.map((u: { name: string }) => u.name).sort()).toEqual(["Mia Manager", "Sam Super"]);
    expect(body.users.length).toBe(2);

    const mine = await (
      await activityGET(jsonRequest(`/api/admin/activity?userId=${sm.id}&kind=login`, { cookie }))
    ).json();
    expect(mine.entries).toHaveLength(1);
    expect(mine.entries[0]).toMatchObject({ kind: "login", userName: "Mia Manager", outcome: "success" });

    const changes = await (await activityGET(jsonRequest(`/api/admin/activity?kind=change`, { cookie }))).json();
    expect(changes.entries.every((e: { kind: string }) => e.kind === "change")).toBe(true);

    const future = await (
      await activityGET(jsonRequest(`/api/admin/activity?dateFrom=2099-01-01`, { cookie }))
    ).json();
    expect(future.entries).toEqual([]);

    expect((await activityGET(jsonRequest(`/api/admin/activity?kind=bogus`, { cookie }))).status).toBe(400);
    expect((await activityGET(jsonRequest(`/api/admin/activity?dateTo=yesterday`, { cookie }))).status).toBe(400);
  });
});
