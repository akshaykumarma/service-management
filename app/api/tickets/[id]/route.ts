import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { statusHistory, tickets, ticketPhotos, users } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { assertAccess, AccessDeniedError } from "@/lib/auth/rbac";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const rows = await db.select().from(tickets).where(eq(tickets.id, params.id)).limit(1);
  const ticket = rows[0];

  // No existence leak to an out-of-scope caller: 404 either way (contracts/tickets-api.md).
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

  const historyRows = await db
    .select({
      fromStatus: statusHistory.fromStatus,
      toStatus: statusHistory.toStatus,
      actorId: statusHistory.actorId,
      actorName: users.name,
      comment: statusHistory.comment,
      createdAt: statusHistory.createdAt,
    })
    .from(statusHistory)
    .innerJoin(users, eq(statusHistory.actorId, users.id))
    .where(eq(statusHistory.ticketId, ticket.id))
    .orderBy(asc(statusHistory.createdAt));

  const photoRows = await db.select().from(ticketPhotos).where(eq(ticketPhotos.ticketId, ticket.id));

  return NextResponse.json({
    ticket,
    statusHistory: historyRows,
    photos: photoRows.map((p) => ({ objectKey: p.objectKey })),
  });
}
