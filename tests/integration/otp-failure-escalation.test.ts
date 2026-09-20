import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { resetMockWhatsApp, setPhoneFailure } from "../helpers/whatsapp-mock-client";
import { waitFor } from "../helpers/wait-for";
import { POST as deliverPOST } from "@/app/api/tickets/[id]/deliver/route";
import { POST as correctPhonePOST } from "@/app/api/tickets/[id]/deliver/correct-phone/route";
import { POST as overridePOST } from "@/app/api/tickets/[id]/deliver/override/route";
import { db } from "@/lib/db/client";
import { notifications, tickets } from "@/lib/db/schema";

async function waitForOtpNotificationTo(ticketId: string, phone: string, status: "sent" | "failed") {
  return waitFor(
    async () => {
      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.ticketId, ticketId));
      return rows.find((r) => r.type === "otp" && r.recipientPhone === phone && r.status === status);
    },
    {
      // A "failed" status only appears after the job's own 3-attempt retry-with-backoff
      // (jobs/send-whatsapp-message.ts: up to ~600ms of sleeps plus 3 round trips) on
      // top of the worker's own poll interval — this test hits that path twice, so the
      // default 5s margin can be too tight under full-suite worker contention.
      timeoutMs: 10_000,
      message: `expected an otp notification to ${phone} with status ${status}`,
    },
  );
}

describe("OTP delivery failure escalation (User Story 5)", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("lets an Admin correct the phone and retry, then override to Delivered once the retry also fails; denies both to a Store Service Manager", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const originalPhone = "+919000000001";
    const correctedPhone = "+919000000002";
    await setPhoneFailure(originalPhone, true);
    await setPhoneFailure(correctedPhone, true);

    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "completed", customerPhone: originalPhone });
    const smCookie = await loginAs(sm.email, "Correct123!");
    const adminCookie = await loginAs(admin.email, "Correct123!");

    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie: smCookie }), {
      params: { id: ticket.id },
    });
    await waitForOtpNotificationTo(ticket.id, originalPhone, "failed");

    const smCorrect = await correctPhonePOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/correct-phone`, {
        method: "POST",
        cookie: smCookie,
        body: { correctedPhone },
      }),
      { params: { id: ticket.id } },
    );
    expect(smCorrect.status).toBe(403);

    const adminCorrect = await correctPhonePOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/correct-phone`, {
        method: "POST",
        cookie: adminCookie,
        body: { correctedPhone },
      }),
      { params: { id: ticket.id } },
    );
    expect(adminCorrect.status).toBe(202);

    const updatedTicket = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(updatedTicket[0].customerPhone).toBe(correctedPhone);

    await waitForOtpNotificationTo(ticket.id, correctedPhone, "failed");

    const smOverride = await overridePOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/override`, {
        method: "POST",
        cookie: smCookie,
        body: { reason: "customer confirmed by phone call" },
      }),
      { params: { id: ticket.id } },
    );
    expect(smOverride.status).toBe(403);

    const adminOverride = await overridePOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/override`, {
        method: "POST",
        cookie: adminCookie,
        body: { reason: "customer confirmed by phone call" },
      }),
      { params: { id: ticket.id } },
    );
    expect(adminOverride.status).toBe(200);
    const overrideBody = await adminOverride.json();
    expect(overrideBody.ticket.status).toBe("delivered");
    expect(overrideBody.override.reason).toBe("customer confirmed by phone call");
  });

  it("409s no_send_failure_to_correct and correction_not_yet_attempted when called out of order", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: admin.id, status: "completed" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const correctRes = await correctPhonePOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/correct-phone`, {
        method: "POST",
        cookie,
        body: { correctedPhone: "+919000000009" },
      }),
      { params: { id: ticket.id } },
    );
    expect(correctRes.status).toBe(409);
    expect((await correctRes.json()).error.code).toBe("no_send_failure_to_correct");

    const overrideRes = await overridePOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/override`, { method: "POST", cookie, body: { reason: "test" } }),
      { params: { id: ticket.id } },
    );
    expect(overrideRes.status).toBe(409);
    expect((await overrideRes.json()).error.code).toBe("correction_not_yet_attempted");
  });
});
