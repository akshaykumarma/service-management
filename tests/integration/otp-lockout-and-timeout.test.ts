import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { resetMockWhatsApp } from "../helpers/whatsapp-mock-client";
import { POST as deliverPOST } from "@/app/api/tickets/[id]/deliver/route";
import { POST as verifyPOST } from "@/app/api/tickets/[id]/deliver/verify/route";
import { POST as reinitiatePOST } from "@/app/api/tickets/[id]/deliver/reinitiate/route";
import { db } from "@/lib/db/client";
import { otpVerifications } from "@/lib/db/schema";
import { sweepTimedOutOtpAttempts } from "@/jobs/sweep-otp-timeouts";

async function setupCompletedTicket(role: "service_manager" | "admin" = "service_manager") {
  const store = await createStore();
  const staff = await createUser({ role, storeIds: [store.id], password: "Correct123!" });
  const ticket = await createTicket({ storeId: store.id, createdBy: staff.id, status: "completed" });
  const cookie = await loginAs(staff.email, "Correct123!");
  return { store, staff, ticket, cookie };
}

describe("OTP lockout & Admin override (User Story 4)", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("locks after 3 wrong entries and denies reinitiation to a Store Service Manager but allows it for an Admin", async () => {
    const { store, ticket, cookie: smCookie } = await setupCompletedTicket("service_manager");
    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie: smCookie }), {
      params: { id: ticket.id },
    });

    for (let i = 0; i < 3; i++) {
      await verifyPOST(
        jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, {
          method: "POST",
          cookie: smCookie,
          body: { code: "000000" },
        }),
        { params: { id: ticket.id } },
      );
    }

    const rows = await db.select().from(otpVerifications).where(eq(otpVerifications.ticketId, ticket.id));
    expect(rows[0].locked).toBe(true);

    const smReinitiate = await reinitiatePOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/reinitiate`, { method: "POST", cookie: smCookie }),
      { params: { id: ticket.id } },
    );
    expect(smReinitiate.status).toBe(403);

    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const adminCookie = await loginAs(admin.email, "Correct123!");

    const adminReinitiate = await reinitiatePOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/reinitiate`, { method: "POST", cookie: adminCookie }),
      { params: { id: ticket.id } },
    );
    expect(adminReinitiate.status).toBe(202);

    const rowsAfterReinitiate = await db.select().from(otpVerifications).where(eq(otpVerifications.ticketId, ticket.id));
    expect(rowsAfterReinitiate).toHaveLength(2);
    expect(rowsAfterReinitiate.find((r) => r.id === rows[0].id)?.locked).toBe(true); // never cleared
    expect(rowsAfterReinitiate.some((r) => r.id !== rows[0].id && !r.locked)).toBe(true);
  });

  it("locks via the timeout sweep once code and resend both expire untouched, gating reinitiation the same way", async () => {
    const { ticket, cookie } = await setupCompletedTicket("admin");
    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), {
      params: { id: ticket.id },
    });

    // Simulate the code expiring untouched (no wrong entries, no resend).
    await db
      .update(otpVerifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(otpVerifications.ticketId, ticket.id));

    await sweepTimedOutOtpAttempts();

    const rows = await db.select().from(otpVerifications).where(eq(otpVerifications.ticketId, ticket.id));
    expect(rows[0].locked).toBe(true);

    const reinitiateRes = await reinitiatePOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/reinitiate`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(reinitiateRes.status).toBe(202);
  });
});
