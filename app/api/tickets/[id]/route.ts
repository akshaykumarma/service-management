import { NextRequest, NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deliveryOverrides, notifications, otpVerifications, statusHistory, tickets, ticketPhotos, ticketLineItems, users } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { assertAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { calculateBill } from "@/lib/billing/bill-calculation";
import { hasUnconfirmedFailedNotification, needsOtpOverride } from "@/lib/notifications/alerts";
import { hasActiveOtpAttempt } from "@/lib/delivery/otp";
import { correctionRetryHasFailed, hasFailedOtpSend } from "@/lib/delivery/override";
import { lookupHistory } from "@/lib/tickets/history";

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

  // data-model.md (004-parts-services-catalogue): the bill is "included in ticket-detail
  // ... responses" — an additive extension to this contract, not a breaking change.
  const lineItemRows = await db.select().from(ticketLineItems).where(eq(ticketLineItems.ticketId, ticket.id));
  const bill = await calculateBill(ticket.id);

  // 005-customer-notifications: additive extensions to this contract, same pattern as bill above.
  const failedNotificationAlert = await hasUnconfirmedFailedNotification(ticket.id);
  const activeOtpAttempt = await hasActiveOtpAttempt(ticket.id);
  const otpLocked = await needsOtpOverride(ticket.id);
  const sendFailed = await hasFailedOtpSend(ticket.id);
  const canOverride = await correctionRetryHasFailed(ticket.id);

  // 006-dashboard-reporting FR-011: three more additive sections, same pattern as bill
  // above — Service History, WhatsApp Notification Log, and the OTP/override outcome.
  const rawHistory = await lookupHistory(caller, ticket.machineModel);
  const serviceHistory = {
    found: rawHistory.entries.some((e) => e.id !== ticket.id),
    entries: rawHistory.entries.filter((e) => e.id !== ticket.id),
  };

  const notificationRows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.ticketId, ticket.id))
    .orderBy(desc(notifications.sentAt));
  const notificationLog = notificationRows.map((n) => ({
    type: n.type,
    channel: n.channel,
    recipientPhone: n.recipientPhone,
    status: n.status,
    sentAt: n.sentAt,
  }));

  const otpRows = await db
    .select()
    .from(otpVerifications)
    .where(eq(otpVerifications.ticketId, ticket.id))
    .orderBy(desc(otpVerifications.issuedAt));
  const verifiedRow = otpRows.find((r) => r.verifiedAt);

  let otpOutcome: unknown = null;
  if (verifiedRow) {
    const verifierRows = verifiedRow.verifiedBy
      ? await db.select().from(users).where(eq(users.id, verifiedRow.verifiedBy)).limit(1)
      : [];
    otpOutcome = { method: "otp", verifiedAt: verifiedRow.verifiedAt, verifiedBy: verifierRows[0]?.name ?? null };
  } else {
    const [overrideRow] = await db.select().from(deliveryOverrides).where(eq(deliveryOverrides.ticketId, ticket.id)).limit(1);
    if (overrideRow) {
      const overriderRows = await db.select().from(users).where(eq(users.id, overrideRow.overriddenBy)).limit(1);
      otpOutcome = {
        method: "override",
        reason: overrideRow.reason,
        overriddenBy: overriderRows[0]?.name ?? null,
        createdAt: overrideRow.createdAt,
      };
    }
  }

  return NextResponse.json({
    ticket,
    statusHistory: historyRows,
    photos: photoRows.map((p) => ({ objectKey: p.objectKey })),
    lineItems: lineItemRows.map((li) => ({
      id: li.id,
      itemType: li.itemType,
      nameSnapshot: li.nameSnapshot,
      quantity: li.quantity,
      unitCostSnapshot: Number(li.unitCostSnapshot),
      lineTotal: Number(li.lineTotal),
    })),
    bill,
    notificationAlert: { failed: failedNotificationAlert },
    delivery: { activeAttempt: activeOtpAttempt, locked: otpLocked, sendFailed, canOverride },
    serviceHistory,
    notificationLog,
    otpOutcome,
  });
}
