import { renderTemplate, getApprovedTemplateBody } from "@/lib/whatsapp/templates";
import { getBoss } from "@/lib/jobs/boss";
import { SEND_WHATSAPP_MESSAGE_QUEUE, type SendWhatsAppMessageJobData } from "@/jobs/send-whatsapp-message";

/**
 * Shared by POST .../deliver, .../deliver/resend, and .../deliver/reinitiate — each
 * issues a code via lib/delivery/otp.ts and then enqueues its send identically.
 */
export async function enqueueOtpSend(
  ticket: { id: string; ticketNumber: string; customerPhone: string },
  code: string,
): Promise<void> {
  const boss = await getBoss();
  const approvedBody = await getApprovedTemplateBody("otp");
  const jobData: SendWhatsAppMessageJobData = {
    ticketId: ticket.id,
    type: "otp",
    recipientPhone: ticket.customerPhone,
    templateParams: { ticket_id: ticket.ticketNumber, otp_code: code },
    // Redacted: never persist the real code (plan.md's Constraints — OTP codes never logged).
    storedContent: renderTemplate(approvedBody, { ticket_id: ticket.ticketNumber, otp_code: "REDACTED" }),
  };
  await boss.send(SEND_WHATSAPP_MESSAGE_QUEUE, jobData);
}
