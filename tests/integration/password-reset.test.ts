import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "../helpers/db";
import { createUser } from "../helpers/factories";
import { jsonRequest } from "../helpers/http";

vi.mock("@/lib/email/password-reset", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

import { sendPasswordResetEmail } from "@/lib/email/password-reset";
import { POST as requestPOST } from "@/app/api/auth/password-reset/request/route";
import { POST as confirmPOST } from "@/app/api/auth/password-reset/confirm/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { resetRequestCounts } from "@/lib/auth/password-reset";
import { db } from "@/lib/db/client";
import { passwordResetTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function extractedToken(url: string): string {
  return new URL(url).pathname.split("/").pop()!;
}

describe("Self-service password reset (User Story 3)", () => {
  beforeEach(async () => {
    await resetDb();
    resetRequestCounts.clear();
    vi.mocked(sendPasswordResetEmail).mockClear();
  });

  it("completes the full reset flow: request -> email link -> confirm -> old password rejected, new one works", async () => {
    const user = await createUser({ email: "reset@example.com", password: "OldPassword1!" });

    const reqRes = await requestPOST(jsonRequest("/api/auth/password-reset/request", { method: "POST", body: { email: user.email } }));
    expect(reqRes.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    const [, resetUrl] = vi.mocked(sendPasswordResetEmail).mock.calls[0];
    const token = extractedToken(resetUrl);

    const confirmRes = await confirmPOST(
      jsonRequest("/api/auth/password-reset/confirm", { method: "POST", body: { token, newPassword: "NewPassword1!" } }),
    );
    expect(confirmRes.status).toBe(200);

    const oldLogin = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "OldPassword1!" } }),
    );
    expect(oldLogin.status).toBe(401);

    const newLogin = await loginPOST(
      jsonRequest("/api/auth/login", { method: "POST", body: { email: user.email, password: "NewPassword1!" } }),
    );
    expect(newLogin.status).toBe(200);
  });

  it("returns the identical response whether or not the email is registered (non-enumeration, FR-010)", async () => {
    const known = await createUser({ email: "known@example.com" });

    const res1 = await requestPOST(jsonRequest("/api/auth/password-reset/request", { method: "POST", body: { email: known.email } }));
    const res2 = await requestPOST(
      jsonRequest("/api/auth/password-reset/request", { method: "POST", body: { email: "nobody@example.com" } }),
    );

    expect(res1.status).toBe(res2.status);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1).toEqual(body2);
  });

  it("rejects a token past its 30-minute expiry", async () => {
    const user = await createUser({ email: "expiring@example.com" });
    await requestPOST(jsonRequest("/api/auth/password-reset/request", { method: "POST", body: { email: user.email } }));
    const [, resetUrl] = vi.mocked(sendPasswordResetEmail).mock.calls[0];
    const token = extractedToken(resetUrl);

    // Simulate the token having been issued 31 minutes ago.
    await db
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 60 * 1000) })
      .where(eq(passwordResetTokens.userId, user.id));

    const res = await confirmPOST(
      jsonRequest("/api/auth/password-reset/confirm", { method: "POST", body: { token, newPassword: "NewPassword1!" } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_or_expired_token");
  });

  it("enforces single-use: a second confirm with the same token is rejected", async () => {
    const user = await createUser({ email: "singleuse@example.com" });
    await requestPOST(jsonRequest("/api/auth/password-reset/request", { method: "POST", body: { email: user.email } }));
    const [, resetUrl] = vi.mocked(sendPasswordResetEmail).mock.calls[0];
    const token = extractedToken(resetUrl);

    const first = await confirmPOST(
      jsonRequest("/api/auth/password-reset/confirm", { method: "POST", body: { token, newPassword: "NewPassword1!" } }),
    );
    expect(first.status).toBe(200);

    const second = await confirmPOST(
      jsonRequest("/api/auth/password-reset/confirm", { method: "POST", body: { token, newPassword: "AnotherPassword2!" } }),
    );
    expect(second.status).toBe(400);
  });
});
