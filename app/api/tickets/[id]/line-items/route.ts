import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertTicketAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { addLineItem } from "@/lib/billing/line-items";

const STATUS_CODE_FOR_ERROR: Record<string, number> = {
  invalid_quantity: 400,
  item_inactive: 400,
  ticket_status_invalid: 409,
  not_found: 404,
};

function serializeLineItem(lineItem: { id: string; nameSnapshot: string; quantity: number; unitCostSnapshot: string; lineTotal: string }) {
  return {
    id: lineItem.id,
    nameSnapshot: lineItem.nameSnapshot,
    quantity: lineItem.quantity,
    unitCostSnapshot: Number(lineItem.unitCostSnapshot),
    lineTotal: Number(lineItem.lineTotal),
  };
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const ticketRows = await db.select().from(tickets).where(eq(tickets.id, params.id)).limit(1);
  const ticket = ticketRows[0];
  if (!ticket) {
    return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
  }

  try {
    await assertTicketAccess(caller, ticket);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
    }
    throw err;
  }

  const { itemType, itemId, quantity } = await request.json();
  const result = await addLineItem(params.id, { itemType, itemId, quantity });

  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error } }, { status: STATUS_CODE_FOR_ERROR[result.error] });
  }

  return NextResponse.json({ lineItem: serializeLineItem(result.lineItem), bill: result.bill }, { status: 201 });
}
