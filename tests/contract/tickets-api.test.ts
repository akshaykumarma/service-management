import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as photoUploadUrlPOST } from "@/app/api/tickets/photo-upload-url/route";
import { POST as ticketsPOST } from "@/app/api/tickets/route";
import { GET as ticketGET } from "@/app/api/tickets/[id]/route";

describe("POST /api/tickets/photo-upload-url", () => {
  beforeEach(resetDb);

  it("200s with a presigned upload URL for a valid JPEG under the size limit", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await photoUploadUrlPOST(
      jsonRequest("/api/tickets/photo-upload-url", {
        method: "POST",
        cookie,
        body: { contentType: "image/jpeg", sizeBytes: 1024 * 1024 },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uploadUrl).toBeTruthy();
    expect(body.objectKey).toBeTruthy();
  });

  it("400s with unsupported_content_type for a non-JPEG/PNG file", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await photoUploadUrlPOST(
      jsonRequest("/api/tickets/photo-upload-url", {
        method: "POST",
        cookie,
        body: { contentType: "application/pdf", sizeBytes: 1024 },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("unsupported_content_type");
  });

  it("400s with file_too_large for a file over 5MB", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await photoUploadUrlPOST(
      jsonRequest("/api/tickets/photo-upload-url", {
        method: "POST",
        cookie,
        body: { contentType: "image/png", sizeBytes: 6 * 1024 * 1024 },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("file_too_large");
  });
});

describe("POST /api/tickets", () => {
  beforeEach(resetDb);

  it("201s and creates a ticket with an inline (not-found) history result", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Priya Sharma",
          customerPhone: "+919876500001",
          machineModel: "LG-FHM1207ZDL",
          serialNumber: "SN-LG-FHM1207ZDL",
          issueDescription: "Not spinning",
        },
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket.status).toBe("open");
    expect(body.ticket.ticketNumber).toMatch(/^SVC-\d{4}-\d{5}$/);
    expect(body.history.found).toBe(false);
  });

  it("400s with missing_required_field when a required field is absent", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: { storeId: store.id, customerName: "", customerPhone: "+91...", machineModel: "X", issueDescription: "Y" },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("missing_required_field");
  });

  it("400s with too_many_photos for more than 5 photoObjectKeys", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "X",
          customerPhone: "+91...",
          machineModel: "X",
          serialNumber: "SN-X",
          issueDescription: "Y",
          photoObjectKeys: ["a", "b", "c", "d", "e", "f"],
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("too_many_photos");
  });

  it("400s with missing_required_field when serialNumber is absent", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: { storeId: store.id, customerName: "X", customerPhone: "+91...", machineModel: "X", issueDescription: "Y" },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("missing_required_field");
    expect(body.error.field).toBe("serialNumber");
  });

  it("persists a provided serialNumber", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "Priya Sharma",
          customerPhone: "+919876500002",
          machineModel: "LG-FHM1207ZDL",
          serialNumber: "SN-12345",
          issueDescription: "Not spinning",
        },
      }),
    );
    expect(res.status).toBe(201);
    const { ticket } = await res.json();
    const detail = await ticketGET(jsonRequest(`/api/tickets/${ticket.id}`, { cookie }), { params: { id: ticket.id } });
    expect((await detail.json()).ticket.serialNumber).toBe("SN-12345");
  });

  it("403s when the creator's role/store scope doesn't permit creating at storeId", async () => {
    const storeA = await createStore();
    const storeB = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [storeA.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const res = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: storeB.id,
          customerName: "X",
          customerPhone: "+91...",
          machineModel: "X",
          serialNumber: "SN-X",
          issueDescription: "Y",
        },
      }),
    );
    expect(res.status).toBe(403);
  });
});
