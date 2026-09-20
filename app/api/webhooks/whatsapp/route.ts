import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== actualBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Always responds 200 — a non-200 triggers Meta's own retry storm (contracts/notifications-api.md).
 * Signature failures are silently ignored rather than surfaced, a fail-closed trust boundary:
 * an unsigned/forged payload must not be able to mutate notification state.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!isValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ received: true });
  }

  const payload = JSON.parse(rawBody);
  const statuses = payload?.entry?.flatMap((e: unknown) =>
    (e as { changes?: { value?: { statuses?: { id: string; status: string }[] } }[] })?.changes?.flatMap(
      (c) => c.value?.statuses ?? [],
    ),
  ) ?? [];

  for (const status of statuses) {
    if (!status?.id || !status?.status) continue;
    await db
      .update(notifications)
      .set({ status: status.status, statusUpdatedAt: new Date() })
      .where(eq(notifications.messageId, status.id));
  }

  return NextResponse.json({ received: true });
}
