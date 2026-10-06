import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { resetMockWhatsApp } from "../helpers/whatsapp-mock-client";
import { POST as deliverPOST } from "@/app/api/tickets/[id]/deliver/route";
import { POST as verifyPOST } from "@/app/api/tickets/[id]/deliver/verify/route";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";

// TEMPORARY testing aid (SHOW_OTP_ON_SCREEN) — delete this file with the feature before production.
describe("On-screen OTP test aid", () => {
  const original = process.env.SHOW_OTP_ON_SCREEN;

  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.SHOW_OTP_ON_SCREEN;
    else process.env.SHOW_OTP_ON_SCREEN = original;
  });

  async function setup() {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "completed" });
    return { ticket, cookie: await loginAs(sm.email, "Correct123!") };
  }

  it("returns the issued code when SHOW_OTP_ON_SCREEN=true, and that code verifies", async () => {
    process.env.SHOW_OTP_ON_SCREEN = "true";
    const { ticket, cookie } = await setup();
    const res = await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), {
      params: { id: ticket.id },
    });
    expect(res.status).toBe(202);
    const { testOtp } = await res.json();
    expect(testOtp).toMatch(/^\d{6}$/);

    const verify = await verifyPOST(
      jsonRequest(`/api/tickets/${ticket.id}/deliver/verify`, { method: "POST", cookie, body: { code: testOtp } }),
      { params: { id: ticket.id } },
    );
    expect(verify.status).toBe(200);
    const [row] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(row.status).toBe("delivered");
  });

  it("never reveals the code when the flag is off", async () => {
    delete process.env.SHOW_OTP_ON_SCREEN;
    const { ticket, cookie } = await setup();
    const res = await deliverPOST(jsonRequest(`/api/tickets/${ticket.id}/deliver`, { method: "POST", cookie }), {
      params: { id: ticket.id },
    });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });
});
