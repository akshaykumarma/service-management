import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest, extractSessionCookie } from "../helpers/http";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";

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
