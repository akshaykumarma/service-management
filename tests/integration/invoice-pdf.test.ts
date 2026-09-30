import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../helpers/db";
import { createStore, createTicket, createUser } from "../helpers/factories";
import { db } from "@/lib/db/client";
import { ticketLineItems } from "@/lib/db/schema";
import { renderInvoicePdf } from "@/lib/billing/invoice-pdf";

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
}

async function addLineItems(ticketId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await db.insert(ticketLineItems).values({
      ticketId,
      itemType: i % 2 === 0 ? "part" : "service",
      itemId: randomUUID(),
      nameSnapshot: `Line item ${i + 1}${i % 5 === 0 ? " with a deliberately long description that has to wrap onto a second line" : ""}`,
      quantity: 1,
      unitCostSnapshot: "100.00",
      lineTotal: "100.00",
    });
  }
}

describe("invoice PDF layout", () => {
  beforeEach(resetDb);

  it("renders a one-page A4 invoice with the company logo embedded", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "delivered" });
    await addLineItems(ticket.id, 3);

    const pdf = await renderInvoicePdf(ticket.id);
    expect(pdf).not.toBeNull();
    const raw = pdf!.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toContain("/Subtype /Image");
    // The bundled Plus Jakarta Sans (which, unlike the standard PDF fonts, has a ₹ glyph)
    // is embedded rather than silently falling back to Helvetica.
    expect(raw).toContain("PlusJakartaSans");
    // A4 is 595.28 x 841.89pt.
    expect(raw).toMatch(/\/MediaBox \[0 0 595\.28 841\.89\]/);
    expect(pageCount(pdf!)).toBe(1);
  });

  it("continues a long bill onto further pages instead of running into the footer", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "delivered" });
    await addLineItems(ticket.id, 40);

    const pdf = await renderInvoicePdf(ticket.id);
    expect(pageCount(pdf!)).toBeGreaterThan(1);
  });

  it("renders an invoice with no line items", async () => {
    const store = await createStore();
    const sm = await createUser({ role: "service_manager", storeIds: [store.id] });
    const ticket = await createTicket({ storeId: store.id, createdBy: sm.id, status: "delivered" });

    const pdf = await renderInvoicePdf(ticket.id);
    expect(pageCount(pdf!)).toBe(1);
  });
});
