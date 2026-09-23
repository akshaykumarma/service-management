import { beforeEach, describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { resetMockWhatsApp } from "../helpers/whatsapp-mock-client";
import { waitFor } from "../helpers/wait-for";
import { POST as deliverPOST } from "@/app/api/tickets/[id]/deliver/route";
import { POST as verifyPOST } from "@/app/api/tickets/[id]/deliver/verify/route";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { GET as invoiceByTokenGET } from "@/app/api/invoices/[token]/route";
import { GET as ticketInvoiceGET } from "@/app/api/tickets/[id]/invoice/route";
import { db } from "@/lib/db/client";
import { notifications, otpVerifications, ticketInvoices } from "@/lib/db/schema";
import { verifyOtpCode } from "@/lib/delivery/otp";
import { getOrCreateInvoiceToken } from "@/lib/billing/invoice";

// excludeIds handles a *second* delivery cycle on the same ticket: without it, the
// already-verified row from the first cycle (still the newest by insertion for a plain
// rows[0] read) would be picked again instead of the freshly-issued one.
async function getIssuedCode(ticketId: string, excludeIds: Set<string> = new Set()): Promise<{ id: string; codeHash: string }> {
  return waitFor(
    async () => {
      const rows = await db
        .select()
        .from(otpVerifications)
        .where(eq(otpVerifications.ticketId, ticketId))
        .orderBy(desc(otpVerifications.issuedAt));
      return rows.find((r) => !excludeIds.has(r.id));
    },
    { message: "expected a new otp_verifications row to be issued" },
  );
}

async function bruteForceCode(codeHash: string): Promise<string> {
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = String(i).padStart(6, "0");
    if (verifyOtpCode(candidate, codeHash)) return candidate;
  }
  throw new Error("no matching code found");
}

async function deliverViaOtp(ticketId: string, cookie: string, excludeIds: Set<string> = new Set()) {
  await deliverPOST(jsonRequest(`/api/tickets/${ticketId}/deliver`, { method: "POST", cookie }), {
    params: { id: ticketId },
  });
  const row = await getIssuedCode(ticketId, excludeIds);
  const code = await bruteForceCode(row.codeHash);
  return verifyPOST(jsonRequest(`/api/tickets/${ticketId}/deliver/verify`, { method: "POST", cookie, body: { code } }), {
    params: { id: ticketId },
  });
}

describe("Invoice PDF + WhatsApp link at delivery (post-005 product feedback)", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("sends a WhatsApp message with a working invoice download link on the first delivery, and not again on a later re-delivery", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      status: "completed",
      customerName: "Priya Sharma",
      customerPhone: "+919999955555",
      machineModel: "Widget-9000",
    });
    const cookie = await loginAs(sm.email, "Correct123!");

    const verifyRes = await deliverViaOtp(ticket.id, cookie);
    expect(verifyRes.status).toBe(200);

    const notif = await waitFor(
      async () => {
        const rows = await db
          .select()
          .from(notifications)
          .where(eq(notifications.ticketId, ticket.id));
        return rows.find((r) => r.type === "invoice");
      },
      { message: "expected an invoice notifications row" },
    );
    expect(notif!.status).toBe("sent");
    expect(notif!.recipientPhone).toBe("+919999955555");
    expect(notif!.renderedContent).toContain("Priya Sharma");
    expect(notif!.renderedContent).toContain(ticket.ticketNumber);
    expect(notif!.renderedContent).toMatch(/\/api\/invoices\/[\w-]+/);

    const tokenMatch = notif!.renderedContent.match(/\/api\/invoices\/([\w-]+)/);
    const token = tokenMatch![1];

    const downloadRes = await invoiceByTokenGET(jsonRequest(`/api/invoices/${token}`), { params: { token } });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe("application/pdf");

    const badRes = await invoiceByTokenGET(jsonRequest("/api/invoices/not-a-real-token"), {
      params: { token: "not-a-real-token" },
    });
    expect(badRes.status).toBe(404);

    // Admin moves it back (requires a comment), then it's delivered again via a fresh
    // OTP cycle — the second delivery must not trigger a second WhatsApp send.
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const adminCookie = await loginAs(admin.email, "Correct123!");
    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie: adminCookie,
        body: { toStatus: "completed", comment: "re-verifying" },
      }),
      { params: { id: ticket.id } },
    );
    const priorOtpRows = await db.select({ id: otpVerifications.id }).from(otpVerifications).where(eq(otpVerifications.ticketId, ticket.id));
    const secondVerify = await deliverViaOtp(ticket.id, adminCookie, new Set(priorOtpRows.map((r) => r.id)));
    expect(secondVerify.status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 700));
    const invoiceNotifs = (await db.select().from(notifications).where(eq(notifications.ticketId, ticket.id))).filter(
      (n) => n.type === "invoice",
    );
    expect(invoiceNotifs).toHaveLength(1);

    // The token itself is stable across the two deliveries — one invoice per ticket.
    const tokenRows = await db.select().from(ticketInvoices).where(eq(ticketInvoices.ticketId, ticket.id));
    expect(tokenRows).toHaveLength(1);
  });

  it("lets a staff member with ticket access download the invoice via the authenticated route", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "completed" });
    const cookie = await loginAs(sm.email, "Correct123!");

    await deliverViaOtp(ticket.id, cookie);

    const res = await ticketInvoiceGET(jsonRequest(`/api/tickets/${ticket.id}/invoice`, { cookie }), {
      params: { id: ticket.id },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    const otherStore = await createStore();
    const otherSm = await createUser({ role: "service_manager", storeIds: [otherStore.id], password: "Correct123!" });
    const otherCookie = await loginAs(otherSm.email, "Correct123!");
    const forbiddenRes = await ticketInvoiceGET(jsonRequest(`/api/tickets/${ticket.id}/invoice`, { cookie: otherCookie }), {
      params: { id: ticket.id },
    });
    expect(forbiddenRes.status).toBe(404);
  });

  it("getOrCreateInvoiceToken is idempotent for the same ticket", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id });

    const first = await getOrCreateInvoiceToken(ticket.id);
    const second = await getOrCreateInvoiceToken(ticket.id);
    expect(first).toBe(second);
  });
});
