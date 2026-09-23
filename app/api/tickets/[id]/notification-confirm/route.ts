import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { manualNotificationConfirmations, notifications, tickets } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertTicketAccess, AccessDeniedError } from "@/lib/auth/rbac";

/**
 * FR-005: "the responsible Service Manager" is read here as store-scoped access, not a
 * single named individual (research.md's reassignment-edge-case reading) — same
 * assertTicketAccess check as every other ticket-scoped endpoint, not a narrower one.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const rows = await db.select().from(tickets).where(eq(tickets.id, params.id)).limit(1);
  const ticket = rows[0];
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

  // Same "failed with no confirmation yet" shape as lib/notifications/alerts.ts's
  // hasUnconfirmedFailedNotification — confirming every such row here is what makes
  // that derived alert flip back to false afterward.
  const unconfirmed = await db
    .select({ id: notifications.id })
    .from(notifications)
    .leftJoin(manualNotificationConfirmations, eq(manualNotificationConfirmations.notificationId, notifications.id))
    .where(
      and(eq(notifications.ticketId, ticket.id), eq(notifications.status, "failed"), isNull(manualNotificationConfirmations.id)),
    );

  if (unconfirmed.length === 0) {
    return NextResponse.json({ error: { code: "no_failed_notification" } }, { status: 409 });
  }

  for (const n of unconfirmed) {
    await db.insert(manualNotificationConfirmations).values({ notificationId: n.id, confirmedBy: caller.id });
  }

  return NextResponse.json({ confirmed: true });
}
