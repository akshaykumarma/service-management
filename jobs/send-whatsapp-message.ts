import type { PgBoss, Job } from "pg-boss";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";

export const SEND_WHATSAPP_MESSAGE_QUEUE = "send-whatsapp-message";

export interface SendWhatsAppMessageJobData {
  ticketId: string | null;
  type: "completion" | "otp";
  recipientPhone: string;
  /** The full text actually sent to the customer (e.g. contains the real OTP code). */
  sendContent: string;
  /** What gets persisted in notifications.rendered_content — redacted for OTP sends, so
   * a plaintext code is never stored (plan.md's Constraints: "never logged"). */
  storedContent: string;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries the send itself, in-process, before ever writing a `notifications` row — so a
 * transient failure never produces more than one persisted outcome per logical send
 * attempt (letting pg-boss retry the whole job would insert a new row per retry).
 */
export async function processSendWhatsAppMessageJob(data: SendWhatsAppMessageJobData): Promise<void> {
  let messageId: string | null = null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await sendWhatsAppMessage({
        to: data.recipientPhone,
        templateType: data.type,
        params: {},
      });
      messageId = result.messageId;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BACKOFF_MS * attempt);
      }
    }
  }

  await db.insert(notifications).values({
    ticketId: data.ticketId,
    type: data.type,
    recipientPhone: data.recipientPhone,
    renderedContent: data.storedContent,
    status: messageId ? "sent" : "failed",
    messageId,
  });

  if (!messageId) {
    console.error(`WhatsApp send failed after ${MAX_ATTEMPTS} attempts`, lastError);
  }
}

export async function registerSendWhatsAppMessageWorker(boss: PgBoss): Promise<void> {
  await boss.work<SendWhatsAppMessageJobData>(
    SEND_WHATSAPP_MESSAGE_QUEUE,
    // A fast poll (the minimum pg-boss allows) keeps test latency low; harmless in
    // production at this feature's scale (a handful of sends per store per day).
    { pollingIntervalSeconds: 0.5 },
    async ([job]: Job<SendWhatsAppMessageJobData>[]) => {
      await processSendWhatsAppMessageJob(job.data);
    },
  );
}
