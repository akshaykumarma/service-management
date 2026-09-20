const BASE_URL = process.env.WHATSAPP_API_URL ?? "http://localhost:4570";

export async function setPhoneFailure(phone: string, shouldFail: boolean): Promise<void> {
  await fetch(`${BASE_URL}/__control/fail`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, shouldFail }),
  });
}

export async function resetMockWhatsApp(): Promise<void> {
  await fetch(`${BASE_URL}/__control/reset`, { method: "POST" });
}

export interface ReceivedMessage {
  to: string;
  templateType: string;
  params: Record<string, string>;
  messageId: string;
}

export async function getReceivedMessages(): Promise<ReceivedMessage[]> {
  const res = await fetch(`${BASE_URL}/__control/received`);
  const body = await res.json();
  return body.received;
}
