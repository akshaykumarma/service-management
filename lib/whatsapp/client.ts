import { buildMetaTemplateMessage, type MessageType } from "@/lib/whatsapp/meta";

/**
 * Meta WhatsApp Business Cloud API client (plan.md — plain HTTPS calls, no SDK needed).
 * Points at WHATSAPP_API_URL, which is the mock server in dev/test
 * (tests/helpers/mock-whatsapp-server.ts) and Meta's real Graph API endpoint in
 * production. The mock speaks a simplified request shape; with WHATSAPP_PROVIDER=meta the
 * same call is sent as a Meta template message instead (lib/whatsapp/meta.ts). Both answer
 * with Meta's `{ messages: [{ id }] }`.
 */
export interface SendMessageInput {
  to: string;
  templateType: MessageType;
  params: Record<string, string>;
}

export interface SendMessageResult {
  messageId: string;
}

export class WhatsAppSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

/** "meta" talks to Meta's real WhatsApp Cloud API; anything else, the dev/test mock. */
export function isMetaProvider(): boolean {
  return process.env.WHATSAPP_PROVIDER === "meta";
}

const SEND_TIMEOUT_MS = 15_000;

export async function sendWhatsAppMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const baseUrl = process.env.WHATSAPP_API_URL;
  if (!baseUrl) {
    throw new WhatsAppSendError("WHATSAPP_API_URL is not configured");
  }

  let url = `${baseUrl}/messages`;
  let payload: unknown = input;
  if (isMetaProvider()) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!phoneNumberId) throw new WhatsAppSendError("WHATSAPP_PHONE_NUMBER_ID is not configured");
    url = `${baseUrl.replace(/\/$/, "")}/${phoneNumberId}/messages`;
    payload = buildMetaTemplateMessage(input);
  }

  // A send that never answers must not hold a worker slot (and its message record) forever.
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN ?? ""}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new WhatsAppSendError(`WhatsApp send failed (${res.status}): ${body}`);
  }

  const body = await res.json();
  const messageId = body.messages?.[0]?.id;
  if (!messageId) {
    throw new WhatsAppSendError("WhatsApp send response missing message id");
  }

  return { messageId };
}
