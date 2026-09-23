import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets, userStores, users } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { assertAccess, AccessDeniedError } from "@/lib/auth/rbac";

/**
 * Technicians assigned to the ticket's own store, for the Service Manager's
 * assign-technician picker on the ticket detail page. Store-scoped, not
 * assignment-scoped (assertAccess, not assertTicketAccess) — this is a read used to pick
 * who to assign, not an action gated by an assignment that doesn't exist yet.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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

  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userStores, eq(userStores.userId, users.id))
    .where(and(eq(users.role, "technician"), eq(users.active, true), eq(userStores.storeId, ticket.storeId)));

  return NextResponse.json({ technicians: rows });
}
