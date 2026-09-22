import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest, extractSessionCookie } from "../helpers/http";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";

describe("CSRF protection (constitution Principle IV)", () => {
  beforeEach(resetDb);

  it("rejects a login request whose Origin does not match this app's own origin", async () => {
    const user = await createUser({ email: "csrf@example.com", password: "Correct123!" });
    const res = await loginPOST(
      jsonRequest("/api/auth/login", {
        method: "POST",
        body: { email: user.email, password: "Correct123!" },
        origin: "https://evil.example",
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("csrf_check_failed");
  });

  it("rejects a state-changing request with neither Origin nor Referer present", async () => {
    const user = await createUser({ email: "csrf2@example.com", password: "Correct123!" });
    const res = await loginPOST(
      jsonRequest("/api/auth/login", {
        method: "POST",
        body: { email: user.email, password: "Correct123!" },
        origin: null,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("accepts a request whose Origin has the same host but a different scheme (TLS-terminating proxy, e.g. ngrok/Nginx)", async () => {
    const user = await createUser({ email: "csrf4@example.com", password: "Correct123!" });
    const res = await loginPOST(
      jsonRequest("/api/auth/login", {
        method: "POST",
        body: { email: user.email, password: "Correct123!" },
        // Same host:port as the request's own URL (localhost:3000, per jsonRequest's
        // fixed base), but https where the app itself sees a plain http connection —
        // exactly what happens when a TLS-terminating reverse proxy forwards the
        // original Host header but not the original scheme. A strict full-origin
        // comparison would wrongly reject this as cross-origin.
        origin: "https://localhost:3000",
      }),
    );
    expect(res.status).toBe(200);
  });

  it("still accepts a legitimate same-origin request (no regression)", async () => {
    const user = await createUser({ email: "csrf3@example.com", password: "Correct123!" });
    const loginRes = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "Correct123!" } }),
    );
    expect(loginRes.status).toBe(200);
    const cookie = extractSessionCookie(loginRes)!;

    const logoutRes = await logoutPOST(jsonRequest("/api/auth/logout", { method: "POST", cookie }));
    expect(logoutRes.status).toBe(204);
  });
});
