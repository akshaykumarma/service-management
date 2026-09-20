import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { resetMockWhatsApp } from "../helpers/whatsapp-mock-client";
import { waitFor } from "../helpers/wait-for";
import { POST as ticketsPOST } from "@/app/api/tickets/route";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { POST as partsPOST } from "@/app/api/catalogue/parts/route";
import { POST as lineItemsPOST } from "@/app/api/tickets/[id]/line-items/route";
import { POST as deliverPOST } from "@/app/api/tickets/[id]/deliver/route";
import { POST as verifyPOST } from "@/app/api/tickets/[id]/deliver/verify/route";
import { GET as auditTrailGET } from "@/app/api/tickets/[id]/audit-trail/route";
import { db } from "@/lib/db/client";
import { notifications, otpVerifications } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifyOtpCode } from "@/lib/delivery/otp";

describe("Ticket detail consolidated audit trail (User Story 4)", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("shows zero gaps against status changes, a line item, a notification, and an OTP verification (SC-005)", async () => {
    const store = await createStore();
    const superAdmin = await createUser({ role: "super_admin", password: "Correct123!" });
    const superAdminCookie = await loginAs(superAdmin.email, "Correct123!");
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const createRes = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Audit Trail Customer",
          customerPhone: "+919888800002",
          machineModel: "Model-Audit",
          issueDescription: "Full lifecycle audit trail test",
        },
      }),
    );
    const { ticket } = await createRes.json();

    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "in_progress", comment: null } }),
      { params: { id: ticket.id } },
    );

    const partRes = await partsPOST(
      jsonRequest("/api/catalogue/parts", { method: "POST", cookie: superAdminCookie, body: { name: "Drain Pump", unitCost: 500 } }),
    );
    const part = (await partRes.json()).part;
    await lineItemsPOST(
      jsonRequest(`/api/tickets/${ticket.id}/line-items`, { method: "POST", cookie, body: { itemType: "part", itemId: part.id, quantity: 1 } }),
      { params: { id: ticket.id } },
    );

    await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, { method: "PATCH", cookie, body: { toStatus: "completed", comment: null } }),
      { params: { id: ticket.id } },
    );
    await waitFor(async () => {
      const rows = await db.select().from(notifications).where(eq(notifications.ticketId, ticket.id));
      return rows[0];
    });

    await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), { params: { id: ticket.id } });
    const [otpRow] = await db
      .select()
      .from(otpVerifications)
      .where(eq(otpVerifications.ticketId, ticket.id))
      .orderBy(desc(otpVerifications.issuedAt))
      .limit(1);
    let correctCode = "";
    for (let i = 0; i < 1_000_000; i++) {
      const candidate = String(i).padStart(6, "0");
      if (verifyOtpCode(candidate, otpRow.codeHash)) {
        correctCode = candidate;
        break;
      }
    }
    await verifyPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, { method: "POST", cookie, body: { code: correctCode } }),
      { params: { id: ticket.id } },
    );

    const res = await auditTrailGET(jsonRequest(`/api/tickets/${ticket.id}/audit-trail`, { cookie }), {
      params: { id: ticket.id },
    });
    const body = await res.json();
    const sources = body.entries.map((e: { source: string }) => e.source);

    // Every source in data-model.md's Consolidated Audit Trail is represented — SC-005's
    // "zero gaps" against what 003-005 actually recorded.
    expect(sources).toContain("status_history");
    expect(sources).toContain("line_item");
    expect(sources).toContain("notification");
    expect(sources).toContain("otp");

    // At minimum: created, in_progress, completed, delivered (4 status_history rows).
    expect(sources.filter((s: string) => s === "status_history")).toHaveLength(4);

    const descriptions = body.entries.map((e: { description: string }) => e.description);
    expect(descriptions.some((d: string) => d.includes("Drain Pump"))).toBe(true);
    expect(descriptions.some((d: string) => d.toLowerCase().includes("completion"))).toBe(true);
    expect(descriptions.some((d: string) => d.toLowerCase().includes("verified"))).toBe(true);

    // Chronological order end to end.
    for (let i = 1; i < body.entries.length; i++) {
      expect(new Date(body.entries[i].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(body.entries[i - 1].timestamp).getTime(),
      );
    }
  });
});
