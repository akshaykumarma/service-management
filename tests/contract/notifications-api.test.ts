import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { resetMockWhatsApp } from "../helpers/whatsapp-mock-client";
import { db } from "@/lib/db/client";
import { notifications, otpVerifications } from "@/lib/db/schema";
import { POST as webhookPOST } from "@/app/api/webhooks/whatsapp/route";
import { POST as deliverPOST } from "@/app/api/tickets/[id]/deliver/route";
import { POST as verifyPOST } from "@/app/api/tickets/[id]/deliver/verify/route";
import { POST as resendPOST } from "@/app/api/tickets/[id]/deliver/resend/route";
import { GET as templatesGET } from "@/app/api/templates/route";
import { PATCH as templatePATCH } from "@/app/api/templates/[type]/route";
import { POST as testSendPOST } from "@/app/api/templates/[type]/test-send/route";

function signPayload(payload: string): string {
  return "sha256=" + createHmac("sha256", process.env.WHATSAPP_WEBHOOK_SECRET!).update(payload).digest("hex");
}

function metaWebhookPayload(messageId: string, status: string): string {
  return JSON.stringify({
    entry: [{ changes: [{ value: { statuses: [{ id: messageId, status }] } }] }],
  });
}

function webhookRequest(payload: string, signature: string): NextRequest {
  return new NextRequest(new URL("/api/webhooks/whatsapp", "http://localhost:3000"), {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body: payload,
  });
}

async function insertNotification(messageId: string) {
  const [row] = await db
    .insert(notifications)
    .values({
      ticketId: null,
      type: "completion",
      recipientPhone: "+919999900000",
      renderedContent: "test",
      status: "sent",
      messageId,
    })
    .returning();
  return row;
}

describe("POST /api/webhooks/whatsapp", () => {
  beforeEach(resetDb);

  it("200s and updates notifications.status by message id for a validly-signed payload", async () => {
    const row = await insertNotification("wamid.abc123");
    const payload = metaWebhookPayload("wamid.abc123", "delivered");

    const res = await webhookPOST(webhookRequest(payload, signPayload(payload)));
    expect(res.status).toBe(200);

    const updated = await db.query.notifications.findFirst({ where: (n, { eq }) => eq(n.id, row.id) });
    expect(updated?.status).toBe("delivered");
  });

  it("200s but does NOT update anything for an invalid signature", async () => {
    const row = await insertNotification("wamid.xyz789");
    const payload = metaWebhookPayload("wamid.xyz789", "failed");

    const res = await webhookPOST(webhookRequest(payload, "sha256=invalid"));
    expect(res.status).toBe(200);

    const updated = await db.query.notifications.findFirst({ where: (n, { eq }) => eq(n.id, row.id) });
    expect(updated?.status).toBe("sent");
  });
});

async function setupCompletedTicket() {
  const store = await createStore();
  const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
  const ticket = await createTicket({ storeId: store.id, createdBy: admin.id, status: "completed" });
  const cookie = await loginAs(admin.email, "Correct123!");
  return { store, admin, ticket, cookie };
}

describe("POST /api/tickets/:id/deliver", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("202s and enqueues an OTP send for a Completed ticket", async () => {
    const { ticket, cookie } = await setupCompletedTicket();
    const res = await deliverPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(202);
  });

  it("409s ticket_not_completed for a ticket not in Completed status", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: admin.id, status: "in_progress" });
    const cookie = await loginAs(admin.email, "Correct123!");

    const res = await deliverPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ticket_not_completed");
  });

  it("409s attempt_already_active when an unexpired, unlocked attempt already exists", async () => {
    const { ticket, cookie } = await setupCompletedTicket();
    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), { params: { id: ticket.id } });

    const res = await deliverPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("attempt_already_active");
  });
});

describe("POST /api/tickets/:id/deliver/verify", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("400s incorrect_code with attemptsRemaining for a wrong code", async () => {
    const { ticket, cookie } = await setupCompletedTicket();
    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), { params: { id: ticket.id } });

    const res = await verifyPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, { method: "POST", cookie, body: { code: "000000" } }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("incorrect_code");
    expect(body.error.attemptsRemaining).toBe(2);
  });

  it("400s code_expired for an expired attempt", async () => {
    const { ticket, cookie } = await setupCompletedTicket();
    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), { params: { id: ticket.id } });
    await db
      .update(otpVerifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(otpVerifications.ticketId, ticket.id));

    const res = await verifyPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, { method: "POST", cookie, body: { code: "000000" } }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("code_expired");
  });

  it("423s locked on the 3rd wrong code", async () => {
    const { ticket, cookie } = await setupCompletedTicket();
    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), { params: { id: ticket.id } });

    for (let i = 0; i < 2; i++) {
      await verifyPOST(
        jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, { method: "POST", cookie, body: { code: "000000" } }),
        { params: { id: ticket.id } },
      );
    }
    const res = await verifyPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, { method: "POST", cookie, body: { code: "000000" } }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(423);
    const body = await res.json();
    expect(body.error.code).toBe("locked");
  });
});

describe("POST /api/tickets/:id/deliver/resend", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("429s cooldown_active with retryAfterSeconds before 60 seconds have elapsed", async () => {
    const { ticket, cookie } = await setupCompletedTicket();
    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), { params: { id: ticket.id } });

    const res = await resendPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/resend`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("cooldown_active");
    expect(body.error.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("409s resend_already_used on a second resend", async () => {
    const { ticket, cookie } = await setupCompletedTicket();
    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), { params: { id: ticket.id } });
    await db
      .update(otpVerifications)
      .set({ issuedAt: new Date(Date.now() - 61_000) })
      .where(eq(otpVerifications.ticketId, ticket.id));

    const first = await resendPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/resend`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(first.status).toBe(202);

    const second = await resendPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/resend`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe("resend_already_used");
  });
});

describe("GET/PATCH /api/templates", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  async function superAdminCookie() {
    const admin = await createUser({ role: "super_admin", password: "Correct123!" });
    return loginAs(admin.email, "Correct123!");
  }

  it("200s and returns the built-in default as approved with no pending edit initially", async () => {
    const cookie = await superAdminCookie();
    const res = await templatesGET(jsonRequest("/api/templates", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completion.pending).toBeNull();
    expect(body.completion.approved.body).toContain("{{customer_name}}");
  });

  it("200s a PATCH with a valid body, setting it to pending without changing approved", async () => {
    const cookie = await superAdminCookie();
    const newBody = "Hi {{customer_name}}, thanks for choosing us!";
    const res = await templatePATCH(
      jsonRequest("/api/templates/completion", { method: "PATCH", cookie, body: { body: newBody } }),
      { params: { type: "completion" } },
    );
    expect(res.status).toBe(200);
    const responseBody = await res.json();
    expect(responseBody.pending.body).toBe(newBody);
    expect(responseBody.approved.body).not.toBe(newBody);
  });

  it("400s unsupported_placeholder for an unknown token", async () => {
    const cookie = await superAdminCookie();
    const res = await templatePATCH(
      jsonRequest("/api/templates/completion", { method: "PATCH", cookie, body: { body: "Hi {{not_a_real_token}}" } }),
      { params: { type: "completion" } },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("unsupported_placeholder");
    expect(body.error.token).toBe("not_a_real_token");
  });

  it("403s a non-Super-Admin caller", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");
    const res = await templatePATCH(
      jsonRequest("/api/templates/completion", { method: "PATCH", cookie, body: { body: "Hi {{customer_name}}" } }),
      { params: { type: "completion" } },
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/templates/:type/test-send", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("200s and renders the pending wording without sending or recording a notification when usePending is true", async () => {
    const admin = await createUser({ role: "super_admin", password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");
    await templatePATCH(
      jsonRequest("/api/templates/completion", {
        method: "PATCH",
        cookie,
        body: { body: "Hi {{customer_name}}, pending preview!" },
      }),
      { params: { type: "completion" } },
    );

    const res = await testSendPOST(
      jsonRequest("/api/templates/completion/test-send", {
        method: "POST",
        cookie,
        body: { phone: "+919111111111", usePending: true },
      }),
      { params: { type: "completion" } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.renderedContent).toContain("pending preview!");

    const rows = await db.select().from(notifications).where(eq(notifications.recipientPhone, "+919111111111"));
    expect(rows).toHaveLength(0);
  });
});
