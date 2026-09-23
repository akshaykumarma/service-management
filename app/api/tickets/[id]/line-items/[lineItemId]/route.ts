import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertTicketAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { updateLineItem, removeLineItem } from "@/lib/billing/line-items";

const STATUS_CODE_FOR_ERROR: Record<string, number> = {
  invalid_quantity: 400,
  invalid_unit_cost: 400,
  item_inactive: 400,
  ticket_status_invalid: 409,
  bill_locked: 409,
  not_found: 404,
};

async function loadTicketAndAssertAccess(request: NextRequest, ticketId: string) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const ticketRows = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  const ticket = ticketRows[0];
  if (!ticket) {
    return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
  }

  try {
    await assertTicketAccess(sessionOrResponse.user, ticket);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
    }
    throw err;
  }

  return sessionOrResponse;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; lineItemId: string } },
) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await loadTicketAndAssertAccess(request, params.id);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const { quantity, unitCost } = await request.json();
  const result = await updateLineItem(params.id, params.lineItemId, { quantity, unitCost });

  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error } }, { status: STATUS_CODE_FOR_ERROR[result.error] });
  }

  return NextResponse.json({
    lineItem: {
      id: result.lineItem.id,
      nameSnapshot: result.lineItem.nameSnapshot,
      quantity: result.lineItem.quantity,
      unitCostSnapshot: Number(result.lineItem.unitCostSnapshot),
      lineTotal: Number(result.lineItem.lineTotal),
    },
    bill: result.bill,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; lineItemId: string } },
) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await loadTicketAndAssertAccess(request, params.id);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const result = await removeLineItem(params.id, params.lineItemId);

  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error } }, { status: STATUS_CODE_FOR_ERROR[result.error] });
  }

  return NextResponse.json({ bill: result.bill });
}
