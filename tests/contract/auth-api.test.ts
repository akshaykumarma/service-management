import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest, extractSessionCookie } from "../helpers/http";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";

vi.mock("@/lib/email/password-reset", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

import { POST as passwordResetRequestPOST } from "@/app/api/auth/password-reset/request/route";
import { POST as passwordResetConfirmPOST } from "@/app/api/auth/password-reset/confirm/route";
import { resetRequestCounts } from "@/lib/auth/password-reset";

describe("POST /api/auth/login", () => {
  beforeEach(resetDb);

  it("200s and sets a session cookie for valid credentials", async () => {
    const user = await createUser({ email: "a@example.com", password: "Correct123!" });
    const res = await loginPOST(
      jsonRequest("/api/auth/login", {
        method: "POST",
        body: { email: user.email, password: "Correct123!" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/sm_session=/);
    const body = await res.json();
    expect(body.user).toMatchObject({ email: user.email });
  });

  it("200s logging in with a username instead of email, when the account has one", async () => {
    const user = await createUser({ email: "hasuser@example.com", username: "hasuser", password: "Correct123!" });
    const res = await loginPOST(
      jsonRequest("/api/auth/login", {
        method: "POST",
        body: { email: "hasuser", password: "Correct123!" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ email: user.email });
  });

  it("401s with invalid_credentials for a wrong password", async () => {
    const user = await createUser({ email: "b@example.com", password: "Correct123!" });
    const res = await loginPOST(
      jsonRequest("/api/auth/login", {
        method: "POST",
        body: { email: user.email, password: "WrongPassword" },
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_credentials");
  });

  it("403s with account_deactivated for correct credentials on a deactivated account", async () => {
    const user = await createUser({ email: "c@example.com", password: "Correct123!", active: false });
    const res = await loginPOST(
      jsonRequest("/api/auth/login", {
        method: "POST",
        body: { email: user.email, password: "Correct123!" },
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("account_deactivated");
  });
});

describe("GET /api/auth/session", () => {
  beforeEach(resetDb);

  it("200s with the caller's identity and role/store scope when authenticated", async () => {
    const user = await createUser({ email: "d@example.com", password: "Correct123!", role: "super_admin" });
    const loginRes = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "Correct123!" } }),
    );
    const cookie = extractSessionCookie(loginRes)!;

    const res = await sessionGET(jsonRequest("/api/auth/session", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ email: user.email, role: "super_admin", storeIds: [] });
  });

  it("401s when there is no valid session", async () => {
    const res = await sessionGET(jsonRequest("/api/auth/session"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  beforeEach(resetDb);

  it("204s and clears the session so it can no longer be used", async () => {
    const user = await createUser({ email: "e@example.com", password: "Correct123!" });
    const loginRes = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "Correct123!" } }),
    );
    const cookie = extractSessionCookie(loginRes)!;

    const res = await logoutPOST(jsonRequest("/api/auth/logout", { method: "POST", cookie }));
    expect(res.status).toBe(204);

    const sessionRes = await sessionGET(jsonRequest("/api/auth/session", { cookie }));
    expect(sessionRes.status).toBe(401);
  });
});

describe("POST /api/auth/password-reset/request", () => {
  beforeEach(async () => {
    await resetDb();
    resetRequestCounts.clear();
  });

  it("200s with a generic message regardless of whether the email exists", async () => {
    const res = await passwordResetRequestPOST(
      jsonRequest("/api/auth/password-reset/request", { method: "POST", body: { email: "whoever@example.com" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/if that email is registered/i);
  });
});

describe("POST /api/auth/password-reset/confirm", () => {
  beforeEach(resetDb);

  it("400s with invalid_or_expired_token for an unknown token", async () => {
    const res = await passwordResetConfirmPOST(
      jsonRequest("/api/auth/password-reset/confirm", {
        method: "POST",
        body: { token: "not-a-real-token", newPassword: "NewPassword1!" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_or_expired_token");
  });
});

import { GET as usersGET, POST as usersPOST } from "@/app/api/auth/users/route";
import { PATCH as userPATCH } from "@/app/api/auth/users/[id]/route";
import { POST as resetPasswordPOST } from "@/app/api/auth/users/[id]/reset-password/route";
import { createStore } from "../helpers/factories";
import { DEFAULT_TECHNICIAN_PASSWORD } from "@/lib/auth/password-policy";

async function loginAs(email: string, password: string) {
  const res = await loginPOST(jsonRequest("/api/auth/login", { method: "POST", body: { email, password } }));
  return extractSessionCookie(res)!;
}

describe("POST /api/auth/users", () => {
  beforeEach(resetDb);

  it("creates a staff account with the Super Admin's own chosen password, usable to log in immediately", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New SM",
          email: "newsm@example.com",
          role: "service_manager",
          storeIds: [store.id],
          password: "NewHire#2026",
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.temporaryPassword).toBeUndefined();
    expect(body.user.storeIds).toEqual([store.id]);

    const smCookie = await loginAs("newsm@example.com", "NewHire#2026");
    expect(smCookie).toBeTruthy();
  });

  it("400s with invalid_password for a password that doesn't meet the complexity rule", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New SM",
          email: "weakpw@example.com",
          role: "service_manager",
          storeIds: [store.id],
          password: "lowercase1",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_password");
  });

  it("creates a Technician with no password given, defaulting to DEFAULT_TECHNICIAN_PASSWORD (post-v1 product feedback)", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New Tech",
          email: "newtech@example.com",
          role: "technician",
          storeIds: [store.id],
        },
      }),
    );
    expect(res.status).toBe(201);

    const techCookie = await loginAs("newtech@example.com", DEFAULT_TECHNICIAN_PASSWORD);
    expect(techCookie).toBeTruthy();
  });

  it("still requires a password for a Service Manager (the optional-password default is Technician-only)", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New SM",
          email: "nopasswordsm@example.com",
          role: "service_manager",
          storeIds: [store.id],
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_password");
  });

  it("400s with invalid_email for a malformed email address", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New SM",
          email: "not-an-email",
          role: "service_manager",
          storeIds: [store.id],
          password: "ValidPass1!",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_email");
  });

  it("creates a staff account with an optional username, usable to log in instead of email", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New SM",
          email: "withusername@example.com",
          username: "new.sm-01",
          role: "service_manager",
          storeIds: [store.id],
          password: "ValidPass1!",
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.username).toBe("new.sm-01");

    const smCookie = await loginAs("new.sm-01", "ValidPass1!");
    expect(smCookie).toBeTruthy();
  });

  it("400s with invalid_username for a malformed username", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New SM",
          email: "badusername@example.com",
          username: "a b", // spaces aren't allowed
          role: "service_manager",
          storeIds: [store.id],
          password: "ValidPass1!",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_username");
  });

  it("409s with username_already_registered for a duplicate username", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    await createUser({ username: "taken" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New SM",
          email: "dupusername@example.com",
          username: "taken",
          role: "service_manager",
          storeIds: [store.id],
          password: "ValidPass1!",
        },
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("username_already_registered");
  });

  it("400s with store_assignment_required when storeIds is empty", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: { name: "New Admin", email: "newadmin@example.com", role: "admin", storeIds: [], password: "ValidPass1!" },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("store_assignment_required");
  });

  it("400s with invalid_store_count for a service_manager with more than one store", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const storeA = await createStore();
    const storeB = await createStore();
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: { name: "X", email: "x@example.com", role: "service_manager", storeIds: [storeA.id, storeB.id], password: "ValidPass1!" },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_store_count");
  });

  it("400s with invalid_store_id for a store id that doesn't exist, instead of crashing on the FK constraint", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: { name: "X", email: "nostoresuchid@example.com", role: "admin", storeIds: ["00000000-0000-0000-0000-000000000000"], password: "ValidPass1!" },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_store_id");
  });

  it("409s with email_already_registered for a duplicate email", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const store = await createStore();
    const existing = await createUser({ email: "dup@example.com" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: { name: "X", email: existing.email, role: "admin", storeIds: [store.id], password: "ValidPass1!" },
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("email_already_registered");
  });

  it("denies a non-Super-Admin caller", async () => {
    const admin = await createUser({ role: "admin", password: "Correct123!" });
    const store = await createStore();
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: { name: "X", email: "x2@example.com", role: "admin", storeIds: [store.id] },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("lets an Admin create a Service Manager within their own store (post-v1 product feedback)", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "New SM",
          email: "newsm2@example.com",
          role: "service_manager",
          storeIds: [store.id],
          password: "ValidPass1!",
        },
      }),
    );
    expect(res.status).toBe(201);
  });

  it("403s when an Admin tries to assign a store outside their own scope", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [storeA.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await usersPOST(
      jsonRequest("/api/auth/users", {
        method: "POST",
        cookie,
        body: {
          name: "X",
          email: "outofscope@example.com",
          role: "service_manager",
          storeIds: [storeB.id],
          password: "ValidPass1!",
        },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/auth/users", () => {
  beforeEach(resetDb);

  it("lists staff accounts for a Super Admin", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    await createUser({ role: "admin" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await usersGET(jsonRequest("/api/auth/users", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.length).toBeGreaterThanOrEqual(2);
  });

  it("restricts an Admin to Store Service Managers within their own stores", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [storeA.id], password: "Correct123!" });
    const inScopeSm = await createUser({ role: "service_manager", storeIds: [storeA.id] });
    const outOfScopeSm = await createUser({ role: "service_manager", storeIds: [storeB.id] });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await usersGET(jsonRequest("/api/auth/users", { cookie }));
    expect(res.status).toBe(200);
    const ids = (await res.json()).users.map((u: { id: string }) => u.id);
    expect(ids).toContain(inScopeSm.id);
    expect(ids).not.toContain(outOfScopeSm.id);
    expect(ids).not.toContain(admin.id);
  });
});

describe("PATCH /api/auth/users/:id", () => {
  beforeEach(resetDb);

  it("edits a user and writes an audit_log row", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const target = await createUser({ role: "admin" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await userPATCH(
      jsonRequest(`/api/auth/users/${target.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: target.id } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.active).toBe(false);
  });

  it("409s with last_super_admin when deactivating the last active Super Admin", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await userPATCH(
      jsonRequest(`/api/auth/users/${superAdmin.id}`, { method: "PATCH", cookie, body: { active: false } }),
      { params: { id: superAdmin.id } },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("last_super_admin");
  });

  it("lets an Admin edit a Service Manager's name within their own store (post-v1 product feedback)", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await userPATCH(
      jsonRequest(`/api/auth/users/${sm.id}`, { method: "PATCH", cookie, body: { name: "Renamed by Admin" } }),
      { params: { id: sm.id } },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).user.name).toBe("Renamed by Admin");
  });

  it("404s (not 403) when an Admin targets a Service Manager outside their own stores", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [storeA.id], password: "Correct123!" });
    const outOfScopeSm = await createUser({ role: "service_manager", storeIds: [storeB.id] });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await userPATCH(
      jsonRequest(`/api/auth/users/${outOfScopeSm.id}`, { method: "PATCH", cookie, body: { name: "X" } }),
      { params: { id: outOfScopeSm.id } },
    );
    expect(res.status).toBe(404);
  });

  it("404s when an Admin targets another Admin or a Super Admin, even within their own store", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const otherAdmin = await createUser({ role: "admin", storeIds: [store.id] });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await userPATCH(
      jsonRequest(`/api/auth/users/${otherAdmin.id}`, { method: "PATCH", cookie, body: { name: "X" } }),
      { params: { id: otherAdmin.id } },
    );
    expect(res.status).toBe(404);
  });

  it("403s when an Admin tries to promote a Service Manager to Admin", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await userPATCH(
      jsonRequest(`/api/auth/users/${sm.id}`, { method: "PATCH", cookie, body: { role: "admin" } }),
      { params: { id: sm.id } },
    );
    expect(res.status).toBe(403);
  });

  it("403s when an Admin tries to reassign a Service Manager to a store outside their own scope", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [storeA.id], password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", storeIds: [storeA.id] });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await userPATCH(
      jsonRequest(`/api/auth/users/${sm.id}`, { method: "PATCH", cookie, body: { storeIds: [storeB.id] } }),
      { params: { id: sm.id } },
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/auth/users/:id/reset-password", () => {
  beforeEach(resetDb);

  it("lets a Super Admin reset any staff member's password, and it's usable to log in, replacing their session", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const target = await createUser({ role: "admin", password: "OldPassword1!" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");
    const targetOldCookie = await loginAs(target.email, "OldPassword1!");

    const res = await resetPasswordPOST(
      jsonRequest(`/api/auth/users/${target.id}/reset-password`, {
        method: "POST",
        cookie,
        body: { password: "BrandNew#1" },
      }),
      { params: { id: target.id } },
    );
    expect(res.status).toBe(200);

    // The old session is revoked by the reset (credential-rotation exception to FR-019).
    const staleSessionRes = await sessionGET(jsonRequest("/api/auth/session", { cookie: targetOldCookie }));
    expect(staleSessionRes.status).toBe(401);

    const newCookie = await loginAs(target.email, "BrandNew#1");
    expect(newCookie).toBeTruthy();
  });

  it("lets an Admin reset a Store Service Manager's password within their own store", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "OldPassword1!" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await resetPasswordPOST(
      jsonRequest(`/api/auth/users/${sm.id}/reset-password`, {
        method: "POST",
        cookie,
        body: { password: "BrandNew#1" },
      }),
      { params: { id: sm.id } },
    );
    expect(res.status).toBe(200);

    const newCookie = await loginAs(sm.email, "BrandNew#1");
    expect(newCookie).toBeTruthy();
  });

  it("404s (not 403) when an Admin targets a Service Manager outside their own stores", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [storeA.id], password: "Correct123!" });
    const outOfScopeSm = await createUser({ role: "service_manager", storeIds: [storeB.id] });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await resetPasswordPOST(
      jsonRequest(`/api/auth/users/${outOfScopeSm.id}/reset-password`, {
        method: "POST",
        cookie,
        body: { password: "BrandNew#1" },
      }),
      { params: { id: outOfScopeSm.id } },
    );
    expect(res.status).toBe(404);
  });

  it("404s when an Admin targets another Admin or a Super Admin, even within their own store", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const otherAdmin = await createUser({ role: "admin", storeIds: [store.id] });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await resetPasswordPOST(
      jsonRequest(`/api/auth/users/${otherAdmin.id}/reset-password`, {
        method: "POST",
        cookie,
        body: { password: "BrandNew#1" },
      }),
      { params: { id: otherAdmin.id } },
    );
    expect(res.status).toBe(404);
  });

  it("403s for a Store Service Manager caller", async () => {
    const sm = await createUser({ role: "service_manager", password: "Correct123!" });
    const other = await createUser({ role: "service_manager" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await resetPasswordPOST(
      jsonRequest(`/api/auth/users/${other.id}/reset-password`, {
        method: "POST",
        cookie,
        body: { password: "BrandNew#1" },
      }),
      { params: { id: other.id } },
    );
    expect(res.status).toBe(403);
  });

  it("400s with invalid_password for a password that doesn't meet the complexity rule", async () => {
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const target = await createUser({ role: "admin" });
    const cookie = await loginAs(superAdmin.email, "Correct123!");

    const res = await resetPasswordPOST(
      jsonRequest(`/api/auth/users/${target.id}/reset-password`, {
        method: "POST",
        cookie,
        body: { password: "allsmall" },
      }),
      { params: { id: target.id } },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_password");
  });
});
