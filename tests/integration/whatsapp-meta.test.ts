import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { buildMetaTemplateMessage, META_TEMPLATES, toMetaPhone, toMetaText } from "@/lib/whatsapp/meta";
import { GET as webhookGET } from "@/app/api/webhooks/whatsapp/route";

const saved = { ...process.env };
afterEach(() => {
  for (const key of ["WHATSAPP_TEMPLATE_OTP", "WHATSAPP_TEMPLATE_LANGUAGE", "WHATSAPP_VERIFY_TOKEN"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("Meta WhatsApp Cloud API messages", () => {
  it("formats phone numbers the way Meta wants (digits, with country code)", () => {
    expect(toMetaPhone("+91 98450 11223")).toBe("919845011223");
    expect(toMetaPhone("9845011223")).toBe("919845011223");
    expect(toMetaPhone("09845011223")).toBe("919845011223");
    expect(toMetaPhone("+1 (415) 555-0100")).toBe("14155550100");
  });

  it("flattens values Meta would reject and fills blanks", () => {
    expect(toMetaText("Thread breaks\nand skips")).toBe("Thread breaks and skips");
    expect(toMetaText("a\n\tb")).toBe("a b");
    expect(toMetaText("wide      gap")).toBe("wide   gap");
    expect(toMetaText("")).toBe("—");
    expect(toMetaText(undefined)).toBe("—");
  });

  it("sends a ticket-created template with every value in the documented order", () => {
    const params: Record<string, string> = {
      customer_name: "Lakshmi N",
      store_name: "Shubha Sewing — Balepet",
      ticket_id: "BLP-2026-00031",
      received_date: "27/10/2026",
      machine_model: "Usha Janome Allure",
      serial_number: "UJA-1",
      issue_description: "Thread keeps breaking",
      customer_phone: "+919845011223",
      alt_phone: "",
      estimated_pickup_date: "—",
      store_phone: "080-2345 6789",
    };
    const body = buildMetaTemplateMessage({ to: "+91 98450 11223", templateType: "ticket_created", params });
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "919845011223",
      type: "template",
      template: { name: "ticket_created", language: { code: "en" } },
    });
    const values = body.template.components[0] as { parameters: { text: string }[] };
    expect(values.parameters.map((p) => p.text)).toEqual(
      META_TEMPLATES.ticket_created.params.map((key) => (params[key] === "" ? "—" : params[key])),
    );
  });

  it("passes the OTP to an authentication template's copy-code button too, with overridable name and language", () => {
    process.env.WHATSAPP_TEMPLATE_OTP = "shubha_delivery_code";
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = "en_US";
    const body = buildMetaTemplateMessage({ to: "9845011223", templateType: "otp", params: { otp_code: "482913", ticket_id: "X" } });
    expect(body.template).toEqual({
      name: "shubha_delivery_code",
      language: { code: "en_US" },
      components: [
        { type: "body", parameters: [{ type: "text", text: "482913" }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "482913" }] },
      ],
    });
  });

  it("answers Meta's webhook verification only with the right verify token", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "shubha-verify";
    const verify = (token: string) =>
      webhookGET(
        new NextRequest(
          `http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=1158201444`,
        ),
      );
    const ok = await verify("shubha-verify");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("1158201444");
    expect((await verify("wrong")).status).toBe(403);
  });
});
