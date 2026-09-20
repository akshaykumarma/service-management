import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { resetMockWhatsApp } from "../helpers/whatsapp-mock-client";
import { waitFor } from "../helpers/wait-for";
import { POST as deliverPOST } from "@/app/api/tickets/[id]/deliver/route";
import { POST as verifyPOST } from "@/app/api/tickets/[id]/deliver/verify/route";
import { POST as resendPOST } from "@/app/api/tickets/[id]/deliver/resend/route";
import { GET as ticketGET } from "@/app/api/tickets/[id]/route";
import { db } from "@/lib/db/client";
import { otpVerifications } from "@/lib/db/schema";
import { verifyOtpCode } from "@/lib/delivery/otp";

async function getIssuedCode(ticketId: string): Promise<{ id: string; codeHash: string }> {
  return waitFor(async () => {
    const rows = await db.select().from(otpVerifications).where(eq(otpVerifications.ticketId, ticketId));
    return rows[0];
  }, { message: "expected an otp_verifications row to be issued" });
}

describe("Mandatory OTP-verified delivery (User Story 3)", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("transitions to Delivered on the correct code and records the verifying staff member", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "completed" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const deliverRes = await deliverPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(deliverRes.status).toBe(202);

    const row = await getIssuedCode(ticket.id);
    // The plaintext code only ever exists transiently in the job payload/mock server —
    // recover a code matching the stored hash by brute-forcing this test's own 6-digit
    // space (fast, and never touches real OTP secrets since this is the test env's own
    // OTP_HASH_SECRET).
    let correctCode = "";
    for (let i = 0; i < 1_000_000; i++) {
      const candidate = String(i).padStart(6, "0");
      if (verifyOtpCode(candidate, row.codeHash)) {
        correctCode = candidate;
        break;
      }
    }
    expect(correctCode).not.toBe("");

    const verifyRes = await verifyPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, { method: "POST", cookie, body: { code: correctCode } }),
      { params: { id: ticket.id } },
    );
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.ticket.status).toBe("delivered");
    expect(verifyBody.verifiedBy).toBe(sm.id);
    expect(verifyBody.deliveredAt).toBeTruthy();

    const detail = await ticketGET(jsonRequest(`/api/tickets/${ticket.id}`, { cookie }), { params: { id: ticket.id } });
    const detailBody = await detail.json();
    expect(detailBody.ticket.status).toBe("delivered");
  });

  it("invalidates the prior code on resend and carries the failed-attempt count forward", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "completed" });
    const cookie = await loginAs(sm.email, "Correct123!");

    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), { params: { id: ticket.id } });
    const original = await getIssuedCode(ticket.id);

    // One wrong entry before resending — the count must carry forward onto the new row.
    await verifyPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, { method: "POST", cookie, body: { code: "999999" } }),
      { params: { id: ticket.id } },
    );

    // Fast-forward past the 60-second cooldown.
    await db.update(otpVerifications).set({ issuedAt: new Date(Date.now() - 61_000) }).where(eq(otpVerifications.id, original.id));

    const resendRes = await resendPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/resend`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(resendRes.status).toBe(202);

    const rowsAfterResend = await db.select().from(otpVerifications).where(eq(otpVerifications.ticketId, ticket.id));
    expect(rowsAfterResend).toHaveLength(2);
    const newRow = rowsAfterResend.find((r) => r.id !== original.id)!;
    expect(newRow.failedAttempts).toBe(1);
    expect(newRow.resendUsed).toBe(true);

    // The original code no longer works: after the resend it's superseded (by recency),
    // so verify checks against the new row, and the wrong code below is off that new
    // attempt's counter (this is its 2nd wrong entry: one before the resend, one after).
    let originalCode = "";
    for (let i = 0; i < 1_000_000; i++) {
      const candidate = String(i).padStart(6, "0");
      if (verifyOtpCode(candidate, original.codeHash)) {
        originalCode = candidate;
        break;
      }
    }
    const staleAttempt = await verifyPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, { method: "POST", cookie, body: { code: originalCode } }),
      { params: { id: ticket.id } },
    );
    expect(staleAttempt.status).toBe(400);
    const staleBody = await staleAttempt.json();
    expect(staleBody.error.code).toBe("incorrect_code");
    expect(staleBody.error.attemptsRemaining).toBe(1);
  });
});
