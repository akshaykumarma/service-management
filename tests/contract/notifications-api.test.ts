import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";
import { resetDb } from "../helpers/db";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { POST as webhookPOST } from "@/app/api/webhooks/whatsapp/route";

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
