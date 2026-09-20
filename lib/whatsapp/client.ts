/**
 * Meta WhatsApp Business Cloud API client (plan.md — plain HTTPS calls, no SDK needed).
 * Points at WHATSAPP_API_URL, which is the mock server in dev/test
 * (tests/helpers/mock-whatsapp-server.ts) and Meta's real Graph API endpoint in
 * production. The mock speaks a simplified request/response shape rather than Meta's
 * actual verbose Graph API payload, since every call in this codebase goes through this
 * one function — swapping the real shape in later (if the mock ever needs to diverge from
 * this) touches only this file.
 */
export interface SendMessageInput {
  to: string;
  templateType: "completion" | "otp";
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

export async function sendWhatsAppMessage(input: SendMessageInput): Promise<SendMessageResult> {
  const baseUrl = process.env.WHATSAPP_API_URL;
  if (!baseUrl) {
    throw new WhatsAppSendError("WHATSAPP_API_URL is not configured");
  }

  const res = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN ?? ""}`,
    },
    body: JSON.stringify(input),
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
