import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest, extractSessionCookie } from "../helpers/http";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { GET as sessionGET } from "@/app/api/auth/session/route";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loginAttempts } from "@/lib/auth/lockout";

describe("Login lockout (5 fails -> 15 min lock, self-clearing)", () => {
  beforeEach(async () => {
    await resetDb();
    loginAttempts.clear();
  });

  it("locks the account after 5 consecutive failed attempts, even with the correct password on the 6th try", async () => {
    const user = await createUser({ email: "lockout@example.com", password: "Correct123!" });

    for (let i = 0; i < 5; i++) {
      const res = await loginPOST(
        jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "wrong" } }),
      );
      expect(res.status).toBe(401);
    }

    const lockedRes = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "Correct123!" } }),
    );
    expect(lockedRes.status).toBe(423);
    const body = await lockedRes.json();
    expect(body.error.code).toBe("account_locked");
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("self-clears after the lockout window elapses, with no admin action", async () => {
    const user = await createUser({ email: "lockout2@example.com", password: "Correct123!" });

    for (let i = 0; i < 5; i++) {
      await loginPOST(
        jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "wrong" } }),
      );
    }

    // Simulate the 15-minute lockout window having elapsed.
    const record = loginAttempts.get(user.email.toLowerCase());
    if (record) record.lockedUntil = Date.now() - 1000;

    const res = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "Correct123!" } }),
    );
    expect(res.status).toBe(200);
  });

  it("expires a session after the idle timeout elapses", async () => {
    const user = await createUser({ email: "idle@example.com", password: "Correct123!" });
    const loginRes = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "Correct123!" } }),
    );
    const cookie = extractSessionCookie(loginRes)!;
    const token = cookie.split("=")[1];

    // Simulate the session having gone idle past the configured timeout.
    await db
      .update(sessions)
      .set({ lastActiveAt: new Date(Date.now() - 9 * 60 * 60 * 1000) })
      .where(eq(sessions.sessionToken, token));

    const res = await sessionGET(jsonRequest("/api/auth/session", { cookie }));
    expect(res.status).toBe(401);
  });
});
