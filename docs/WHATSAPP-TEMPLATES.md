# WhatsApp message templates to create in Meta

Meta only delivers business-started WhatsApp messages that use a template it has approved.
Create each template below in **WhatsApp Manager → Message templates → Create template**,
with the **exact name**, **category** and **language** shown, and paste the body text as is.

The `{{1}}`, `{{2}}`, … numbers must stay in the order shown: the app fills them in that
order (`lib/whatsapp/meta.ts`). Meta asks for a sample value for each number — use the
samples given. Approval usually takes minutes, sometimes up to a day.

- **Language:** English (`en`). If you choose "English (US)" instead, set
  `WHATSAPP_TEMPLATE_LANGUAGE=en_US` in `.env`.
- **Different name?** If Meta makes you rename a template, tell the app with
  `WHATSAPP_TEMPLATE_<TYPE>=<new_name>` in `.env` (types: `TICKET_CREATED`, `COMPLETION`,
  `OTP`, `INVOICE`, `DEMO_CREATED`, `DEMO_COMPLETED`, `DEMO_ASSIGNMENT`).
- **Changing the wording later:** edit the template in WhatsApp Manager (it is re-approved).
  The app's **Super Admin → Message templates** page only changes the copy shown in the
  app's Activity log; what customers receive is always Meta's approved template.

---

## 1. `ticket_created` — Utility

Sent when a service ticket is created.

```
Hi {{1}}, thank you for choosing {{2}}. We have received your machine for service.

*Ticket number:* {{3}}
*Received on:* {{4}}
*Machine model:* {{5}}
*Serial number:* {{6}}
*Problem reported:* {{7}}
*Phone:* {{8}}
*Alternate phone:* {{9}}
*Expected ready by:* {{10}}

Please keep your ticket number for reference. We will message you once it is ready for pickup. Questions? Call {{11}}.
```

Samples: 1 `Lakshmi N` · 2 `Shubha Sewing Balepet` · 3 `BLP-2026-00031` · 4 `27/10/2026` ·
5 `Usha Janome Allure` · 6 `UJA-77821` · 7 `Thread keeps breaking` · 8 `+919845011223` ·
9 `—` · 10 `30/10/2026` · 11 `080 2345 6789`

## 2. `service_ready` — Utility

Sent the first time a service ticket is moved to Completed.

```
Hi {{1}}, good news! The service on your {{2}} (Ticket {{3}}) is complete and it is ready for pickup at {{4}}. Total amount to pay: ₹{{5}}. Questions? Call {{6}}.
```

Samples: 1 `Lakshmi N` · 2 `Usha Janome Allure` · 3 `BLP-2026-00031` · 4 `Shubha Sewing Balepet` ·
5 `1,180.00` · 6 `080 2345 6789`

## 3. `delivery_otp` — **Authentication**

Sent at delivery with the one-time code. Meta writes the wording of authentication templates
itself — you only choose the options:

- Code delivery: **Copy code**
- Tick **Add security recommendation** ("For your security, do not share this code.")
- Tick **Add expiry time for the code**: **10 minutes**

(It reads: "*123456* is your verification code. For your security, do not share this code.
This code expires in 10 minutes.")

## 4. `service_invoice` — Utility

Sent when a service ticket is delivered, with the invoice link.

```
Hi {{1}}, your {{2}} (Ticket {{3}}) has been delivered. Download your invoice here: {{4}} Thank you for choosing us!
```

Samples: 1 `Lakshmi N` · 2 `Usha Janome Allure` · 3 `BLP-2026-00031` ·
4 `https://service.example.com/api/invoices/abc123`

## 5. `demo_booked` — Utility

Sent when a demo ticket is created.

```
Hi {{1}}, thank you for choosing {{2}}. Your demo has been booked.

*Ticket number:* {{3}}
*Model number:* {{4}}
*Serial number:* {{5}}
*Invoice number:* {{6}}
*Demo service:* {{7}} (₹{{8}})
*Received on:* {{9}}
*Demo date:* {{10}}
*Phone:* {{11}}

Please keep your ticket number for reference. Questions? Call {{12}}.
```

Samples: 1 `Kavya R` · 2 `Shubha Sewing Balepet` · 3 `BLP-DEMO-2026-00012` · 4 `Juki DDL-8700` ·
5 `DDL87-33321` · 6 `INV-2026-0042` · 7 `Home demo` · 8 `1,250.00` · 9 `27/10/2026` ·
10 `29/10/2026` · 11 `+919448811223` · 12 `080 2345 6789`

## 6. `demo_completed` — Utility

Sent the first time a demo ticket is moved to Completed.

```
Hi {{1}}, your demo has been completed.

*Ticket number:* {{2}}
*Model number:* {{3}}
*Serial number:* {{4}}
*Demo service:* {{5}}
*Demoed by:* {{6}}
*Technician phone:* {{7}}
*Total amount:* ₹{{8}}
*Invoice:* {{9}}

Thank you for choosing {{10}}! Questions? Call {{11}}.
```

Samples: 1 `Kavya R` · 2 `BLP-DEMO-2026-00012` · 3 `Juki DDL-8700` · 4 `DDL87-33321` ·
5 `Home demo` · 6 `Ravi Kumar` · 7 `+919811122233` · 8 `1,250.00` ·
9 `https://service.example.com/api/invoices/xyz789` · 10 `Shubha Sewing Balepet` · 11 `080 2345 6789`

## 7. `demo_assignment` — Utility

Sent to the **technician** when a demo ticket is assigned to them.

```
Hi {{1}}, demo ticket {{2}} has been assigned to you. Customer: {{3}}. Model: {{4}}. Demo date: {{5}}. Open the ticket: {{6}} Thank you.
```

Samples: 1 `Ravi Kumar` · 2 `BLP-DEMO-2026-00012` · 3 `Kavya R` · 4 `Juki DDL-8700` · 5 `29/10/2026` ·
6 `https://service.example.com/t/6jZ4ceKe`
