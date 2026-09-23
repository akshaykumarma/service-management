import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets, userStores, users } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertAccess, AccessDeniedError } from "@/lib/auth/rbac";

/**
 * Sets (or clears, with technicianId: null) the one Technician assigned to this ticket —
 * the Service Manager's own action per the exact request ("assigned to him by the
 * service manager"), so a Technician may not assign themselves or anyone else
 * (store-scope alone would otherwise let a Technician already in this store call this).
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
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
    await assertAccess(caller, ticket.storeId);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "not_found", message: "No such ticket." } }, { status: 404 });
    }
    throw err;
  }

  if (caller.role === "technician") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Technicians cannot assign tickets." } },
      { status: 403 },
    );
  }

  const { technicianId } = await request.json();

  if (technicianId !== null && technicianId !== undefined) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userStores, eq(userStores.userId, users.id))
      .where(
        and(
          eq(users.id, technicianId),
          eq(users.role, "technician"),
          eq(users.active, true),
          eq(userStores.storeId, ticket.storeId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: { code: "invalid_technician", message: "Not an active technician assigned to this store." } },
        { status: 400 },
      );
    }
  }

  const [updatedTicket] = await db
    .update(tickets)
    .set({ assignedTechnicianId: technicianId ?? null, updatedAt: new Date() })
    .where(eq(tickets.id, ticket.id))
    .returning();

  return NextResponse.json({ ticket: updatedTicket });
}
