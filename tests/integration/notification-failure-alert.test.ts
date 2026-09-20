import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { resetMockWhatsApp, setPhoneFailure } from "../helpers/whatsapp-mock-client";
import { waitFor } from "../helpers/wait-for";
import { PATCH as statusPATCH } from "@/app/api/tickets/[id]/status/route";
import { GET as ticketGET } from "@/app/api/tickets/[id]/route";
import { POST as notificationConfirmPOST } from "@/app/api/tickets/[id]/notification-confirm/route";

describe("Notification failure alert (User Story 2)", () => {
  beforeEach(async () => {
    await resetDb();
    await resetMockWhatsApp();
  });

  it("surfaces a failed-notification alert on the ticket that clears only once a manual confirmation is recorded", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const customerPhone = "+919888800001";
    const ticket = await createTicket({
      storeId: store.id,
      createdBy: sm.id,
      status: "in_progress",
      customerPhone,
    });
    const cookie = await loginAs(sm.email, "Correct123!");

    await setPhoneFailure(customerPhone, true);

    const statusRes = await statusPATCH(
      jsonRequest(`/api/tickets/${ticket.id}/status`, {
        method: "PATCH",
        cookie,
        body: { toStatus: "completed", comment: null },
      }),
      { params: { id: ticket.id } },
    );
    expect(statusRes.status).toBe(200);

    await waitFor(async () => {
      const res = await ticketGET(jsonRequest(`/api/tickets/${ticket.id}`, { cookie }), { params: { id: ticket.id } });
      const body = await res.json();
      return body.notificationAlert?.failed === true ? body : undefined;
    }, { message: "expected the failed-notification alert to appear" });

    const detail = await ticketGET(jsonRequest(`/api/tickets/${ticket.id}`, { cookie }), { params: { id: ticket.id } });
    const detailBody = await detail.json();
    expect(detailBody.notificationAlert.failed).toBe(true);

    const confirmRes = await notificationConfirmPOST(
      jsonRequest(`/api/tickets/${ticket.id}/notification-confirm`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(confirmRes.status).toBe(200);

    const afterConfirm = await ticketGET(jsonRequest(`/api/tickets/${ticket.id}`, { cookie }), { params: { id: ticket.id } });
    const afterConfirmBody = await afterConfirm.json();
    expect(afterConfirmBody.notificationAlert.failed).toBe(false);

    const secondConfirm = await notificationConfirmPOST(
      jsonRequest(`/api/tickets/${ticket.id}/notification-confirm`, { method: "POST", cookie }),
      { params: { id: ticket.id } },
    );
    expect(secondConfirm.status).toBe(409);
    const secondConfirmBody = await secondConfirm.json();
    expect(secondConfirmBody.error.code).toBe("no_failed_notification");
  });
});
