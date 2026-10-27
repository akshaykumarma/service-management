/**
 * Meta WhatsApp Cloud API message shape (production). Every message the app sends is a
 * pre-approved Meta *template*: Meta only lets a business start a conversation with one.
 * Each app message type maps to a template name and the ORDER in which its values fill the
 * template's {{1}}, {{2}}, … — the templates created in WhatsApp Manager must use exactly
 * this order (docs/WHATSAPP-TEMPLATES.md lists the wording to submit for each).
 */

export type MessageType =
  | "ticket_created"
  | "completion"
  | "otp"
  | "invoice"
  | "demo_created"
  | "demo_completed"
  | "demo_assignment";

interface MetaTemplateSpec {
  /** Default Meta template name; override with WHATSAPP_TEMPLATE_<TYPE> (e.g. WHATSAPP_TEMPLATE_OTP). */
  name: string;
  /** App placeholder names, in {{1}}, {{2}}, … order. */
  params: string[];
  /** Authentication (OTP) templates also pass the code to their copy-code button. */
  copyCodeButton?: boolean;
}

export const META_TEMPLATES: Record<MessageType, MetaTemplateSpec> = {
  ticket_created: {
    name: "ticket_created",
    params: [
      "customer_name",
      "store_name",
      "ticket_id",
      "received_date",
      "machine_model",
      "serial_number",
      "issue_description",
      "customer_phone",
      "alt_phone",
      "estimated_pickup_date",
      "store_phone",
    ],
  },
  completion: {
    name: "service_ready",
    params: ["customer_name", "machine_model", "ticket_id", "store_name", "bill_total", "store_phone"],
  },
  otp: { name: "delivery_otp", params: ["otp_code"], copyCodeButton: true },
  invoice: { name: "service_invoice", params: ["customer_name", "machine_model", "ticket_id", "invoice_url"] },
  demo_created: {
    name: "demo_booked",
    params: [
      "customer_name",
      "store_name",
      "ticket_id",
      "machine_model",
      "serial_number",
      "invoice_number",
      "demo_service",
      "demo_amount",
      "received_date",
      "demo_date",
      "customer_phone",
      "store_phone",
    ],
  },
  demo_completed: {
    name: "demo_completed",
    params: [
      "customer_name",
      "ticket_id",
      "machine_model",
      "serial_number",
      "demo_service",
      "technician_name",
      "technician_phone",
      "demo_amount",
      "invoice_url",
      "store_name",
      "store_phone",
    ],
  },
  demo_assignment: {
    name: "demo_assignment",
    params: ["technician_name", "ticket_id", "customer_name", "machine_model", "demo_date", "ticket_url"],
  },
};

/**
 * Meta wants the number as digits with the country code and no "+". A bare 10-digit
 * number (how staff often type Indian mobiles) gets the default country code.
 */
export function toMetaPhone(phone: string, defaultCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "91"): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `${defaultCountryCode}${digits.slice(1)}`;
  return digits;
}

/**
 * Meta rejects template values that are empty or contain new lines, tabs or more than four
 * spaces in a row — so a multi-line problem description is flattened, and a missing value
 * becomes "—".
 */
export function toMetaText(value: string | undefined): string {
  const flat = (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
  return flat === "" ? "—" : flat.slice(0, 1000);
}

export function metaTemplateName(type: MessageType): string {
  return process.env[`WHATSAPP_TEMPLATE_${type.toUpperCase()}`] || META_TEMPLATES[type].name;
}

/** The JSON body for POST /{phone-number-id}/messages. */
export function buildMetaTemplateMessage(input: { to: string; templateType: MessageType; params: Record<string, string> }) {
  const spec = META_TEMPLATES[input.templateType];
  const components: Record<string, unknown>[] = [
    { type: "body", parameters: spec.params.map((key) => ({ type: "text", text: toMetaText(input.params[key]) })) },
  ];
  if (spec.copyCodeButton) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: toMetaText(input.params.otp_code) }],
    });
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toMetaPhone(input.to),
    type: "template",
    template: {
      name: metaTemplateName(input.templateType),
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
      components,
    },
  };
}
