import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createUser } from "../helpers/factories";
import { jsonRequest, loginAs } from "../helpers/http";
import { POST as photoUploadUrlPOST } from "@/app/api/tickets/photo-upload-url/route";
import { POST as ticketsPOST } from "@/app/api/tickets/route";
import { db } from "@/lib/db/client";
import { ticketPhotos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

describe("Server-side re-verification of uploaded photos (research.md §5)", () => {
  beforeEach(resetDb);

  it("persists the real content-type/size once the object is actually uploaded, not the client's declared values", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id], password: "Correct123!" });
    const cookie = await loginAs(sm.email, "Correct123!");

    const urlRes = await photoUploadUrlPOST(
      jsonRequest("/api/tickets/photo-upload-url", {
        method: "POST",
        cookie,
        body: { contentType: "image/jpeg", sizeBytes: 1024 },
      }),
    );
    const { uploadUrl, objectKey } = await urlRes.json();

    const bytes = new Uint8Array(2048).fill(1);
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      body: bytes,
    });
    expect(putRes.ok).toBe(true);

    const ticketRes = await ticketsPOST(
      jsonRequest("/api/tickets", {
        method: "POST",
        cookie,
        body: {
          storeId: store.id,
          customerName: "X",
          customerPhone: "+919999911111",
          machineModel: "PhotoModel",
          issueDescription: "Has a photo",
          photoObjectKeys: [objectKey],
        },
      }),
    );
    expect(ticketRes.status).toBe(201);

    const rows = await db.select().from(ticketPhotos).where(eq(ticketPhotos.objectKey, objectKey));
    expect(rows[0].contentType).toBe("image/jpeg");
    expect(rows[0].sizeBytes).toBe(2048);
  });

  it("rejects ticket creation with 400 object_not_found for an objectKey nothing was ever uploaded to", async () => {
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
          customerPhone: "+919999922222",
          machineModel: "GhostModel",
          issueDescription: "Never uploaded",
          photoObjectKeys: ["intake/never-uploaded"],
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("object_not_found");
  });
});
