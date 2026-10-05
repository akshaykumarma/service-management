import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createDemoService, createDemoTicket, createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { GET as detailGET, PATCH as detailPATCH } from "@/app/api/demo-tickets/[id]/route";
import { GET as activityGET } from "@/app/api/demo-tickets/[id]/activity/route";
import { PATCH as assignPATCH } from "@/app/api/demo-tickets/[id]/assign-technician/route";
import { POST as usersPOST } from "@/app/api/auth/users/route";
import { PATCH as userPATCH } from "@/app/api/auth/users/[id]/route";

describe("demo ticket page API (008 US5)", () => {
  beforeEach(resetDb);

  async function setup(status: "new" | "completed" | "cancelled" = "new") {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");
    const ticket = await createDemoTicket({ storeId: store.id, createdBy: sm.id, status, serialNumber: "SN-9", invoiceNumber: "INV-9" });
    const params = { params: { id: ticket.id } };
    return { store, sm, cookie, ticket, params };
  }

  it("returns the ticket with its short URL and demo history, and 404s out of scope", async () => {
    const { store, sm, cookie, ticket, params } = await setup();
    await createDemoTicket({ storeId: store.id, createdBy: sm.id, serialNumber: "sn-9" });
    const body = await (await detailGET(jsonRequest(`/api/demo-tickets/${ticket.id}`, { cookie }), params)).json();
    expect(body.ticket.shortUrl).toMatch(new RegExp(`/t/${ticket.shortCode}$`));
    expect(body.demoHistory.entries).toHaveLength(1);

    const other = await createStore();
    const outsider = await createUser({ role: "service_manager", storeIds: [other.id], password: "Correct123!" });
    const res = await detailGET(jsonRequest(`/api/demo-tickets/${ticket.id}`, { cookie: await loginAs(outsider.email, "Correct123!") }), params);
    expect(res.status).toBe(404);
  });

  it("edits details (including the demo service snapshot) and records the edit in Activity", async () => {
    const { cookie, ticket, params } = await setup();
    const newService = await createDemoService({ name: "Store demo", unitCost: "100.00" });
    const res = await detailPATCH(
      jsonRequest(`/api/demo-tickets/${ticket.id}`, {
        method: "PATCH",
        cookie,
        body: { invoiceNumber: "INV-10", demoServiceId: newService.id, demoDate: "2026-10-12" },
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ticket).toMatchObject({ invoiceNumber: "INV-10", demoServiceName: "Store demo", demoServicePrice: "100.00", demoDate: "2026-10-12" });

    const activity = await (await activityGET(jsonRequest(`/api/demo-tickets/${ticket.id}/activity`, { cookie }), params)).json();
    const edit = activity.entries.find((e: { source: string }) => e.source === "edit");
    expect(edit.description).toContain('Invoice number: "INV-9" → "INV-10"');
    expect(edit.description).toContain('Demo service:');
    expect(activity.entries[0].description).toBe("Demo ticket created (New)");
  });

  it("locks Completed/Cancelled tickets and rejects blank or unknown fields", async () => {
    for (const status of ["completed", "cancelled"] as const) {
      await resetDb();
      const { cookie, ticket, params } = await setup(status);
      const res = await detailPATCH(jsonRequest(`/api/demo-tickets/${ticket.id}`, { method: "PATCH", cookie, body: { invoiceNumber: "X" } }), params);
      expect(res.status).toBe(409);
    }
    await resetDb();
    const { cookie, ticket, params } = await setup();
    const blank = await detailPATCH(jsonRequest(`/api/demo-tickets/${ticket.id}`, { method: "PATCH", cookie, body: { customerName: " " } }), params);
    expect((await blank.json()).error.code).toBe("missing_required_field");
    const unknown = await detailPATCH(jsonRequest(`/api/demo-tickets/${ticket.id}`, { method: "PATCH", cookie, body: { status: "completed" } }), params);
    expect((await unknown.json()).error.code).toBe("invalid_field");
  });

  it("lets an assigned Technician view but not edit or reassign", async () => {
    const { store, cookie, ticket, params } = await setup();
    const tech = await createUser({ role: "technician", storeIds: [store.id], password: "Correct123!" });
    await assignPATCH(jsonRequest(`/api/demo-tickets/${ticket.id}/assign-technician`, { method: "PATCH", cookie, body: { technicianId: tech.id } }), params);
    const techCookie = await loginAs(tech.email, "Correct123!");
    expect((await detailGET(jsonRequest(`/api/demo-tickets/${ticket.id}`, { cookie: techCookie }), params)).status).toBe(200);
    expect((await detailPATCH(jsonRequest(`/api/demo-tickets/${ticket.id}`, { method: "PATCH", cookie: techCookie, body: { invoiceNumber: "Y" } }), params)).status).toBe(403);
    expect(
      (await assignPATCH(jsonRequest(`/api/demo-tickets/${ticket.id}/assign-technician`, { method: "PATCH", cookie: techCookie, body: { technicianId: null } }), params)).status,
    ).toBe(403);
  });
});

describe("user WhatsApp number (008 FR-011)", () => {
  beforeEach(resetDb);

  it("is accepted on create and edit, validated, and clearable", async () => {
    const store = await createStore();
    const admin = await createUser({ role: "admin", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(admin.email, "Correct123!");
    const create = (phone: unknown) =>
      usersPOST(
        jsonRequest("/api/auth/users", {
          method: "POST",
          cookie,
          body: { name: "Tech", email: `t${Math.random()}@example.com`, role: "technician", storeIds: [store.id], password: "Correct123!x", phone },
        }),
      );

    expect((await create("12ab")).status).toBe(400);
    const created = await (await create("+91 98450 33333")).json();
    expect(created.user.phone).toBe("+91 98450 33333");

    const patch = (phone: unknown) =>
      userPATCH(jsonRequest(`/api/auth/users/${created.user.id}`, { method: "PATCH", cookie, body: { phone } }), { params: { id: created.user.id } });
    expect((await (await patch("9845044444")).json()).user.phone).toBe("9845044444");
    expect((await (await patch("")).json()).user.phone).toBeNull();
  });
});
