import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deliveryOverrides, notifications, otpVerifications, statusHistory, ticketLineItems, users } from "@/lib/db/schema";

export interface AuditTrailEntry {
  source: "status_history" | "line_item" | "notification" | "otp" | "override";
  actor: string | null;
  timestamp: Date;
  description: string;
}

/**
 * A read-time merge across every immutably-recorded mutation this ticket has, rather
 * than a new stored audit table (data-model.md) — this view can only ever show what
 * those tables already contain, never less, since every source here is itself
 * append-only or update-in-place-with-history.
 *
 * **Known gap in FR-012's "actor, timestamp, and what changed" for two sources, not
 * fixable from this feature alone**: `ticket_line_items` (004) records no actor at all
 * (no `added_by` column exists), and a removed line item is hard-deleted with no trace
 * (004 never wrote a removal event anywhere) — so a line item added then removed before
 * a ticket reached Completed leaves zero audit record. Notifications are system-
 * triggered (no human actor to attribute). This view surfaces exactly what its four
 * source features recorded; it cannot manufacture data those features never captured.
 */
export async function getConsolidatedAuditTrail(ticketId: string): Promise<AuditTrailEntry[]> {
  const entries: AuditTrailEntry[] = [];

  const historyRows = await db
    .select({
      fromStatus: statusHistory.fromStatus,
      toStatus: statusHistory.toStatus,
      comment: statusHistory.comment,
      createdAt: statusHistory.createdAt,
      actorName: users.name,
    })
    .from(statusHistory)
    .innerJoin(users, eq(statusHistory.actorId, users.id))
    .where(eq(statusHistory.ticketId, ticketId));

  for (const row of historyRows) {
    entries.push({
      source: "status_history",
      actor: row.actorName,
      timestamp: row.createdAt,
      description: row.fromStatus
        ? `Status changed from ${row.fromStatus} to ${row.toStatus}${row.comment ? ` — "${row.comment}"` : ""}`
        : `Ticket created (${row.toStatus})`,
    });
  }

  const lineItemRows = await db.select().from(ticketLineItems).where(eq(ticketLineItems.ticketId, ticketId));
  for (const row of lineItemRows) {
    entries.push({
      source: "line_item",
      actor: null,
      timestamp: row.createdAt,
      description: `${row.itemType === "part" ? "Part" : "Service"} added: ${row.nameSnapshot} x${row.quantity} (${row.lineTotal})`,
    });
  }

  const notificationRows = await db.select().from(notifications).where(eq(notifications.ticketId, ticketId));
  for (const row of notificationRows) {
    entries.push({
      source: "notification",
      actor: null,
      timestamp: row.sentAt,
      description: `${row.type === "completion" ? "Completion" : "OTP"} WhatsApp notification ${row.status} to ${row.recipientPhone}`,
    });
  }

  const otpRows = await db.select().from(otpVerifications).where(eq(otpVerifications.ticketId, ticketId));
  const verifierIds = [...new Set(otpRows.map((r) => r.verifiedBy).filter((id): id is string => id !== null))];
  const verifiers =
    verifierIds.length > 0
      ? new Map((await db.select().from(users).where(inArray(users.id, verifierIds))).map((u) => [u.id, u.name]))
      : new Map<string, string>();

  for (const row of otpRows) {
    entries.push({
      source: "otp",
      actor: null,
      timestamp: row.issuedAt,
      description: `OTP code issued${row.locked ? " (attempt locked)" : ""}`,
    });
    if (row.verifiedAt) {
      entries.push({
        source: "otp",
        actor: row.verifiedBy ? (verifiers.get(row.verifiedBy) ?? null) : null,
        timestamp: row.verifiedAt,
        description: "OTP verified — ticket delivered",
      });
    }
  }

  const overrideRows = await db
    .select({ reason: deliveryOverrides.reason, createdAt: deliveryOverrides.createdAt, actorName: users.name })
    .from(deliveryOverrides)
    .innerJoin(users, eq(deliveryOverrides.overriddenBy, users.id))
    .where(eq(deliveryOverrides.ticketId, ticketId));

  for (const row of overrideRows) {
    entries.push({
      source: "override",
      actor: row.actorName,
      timestamp: row.createdAt,
      description: `Delivery overridden: ${row.reason}`,
    });
  }

  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return entries;
}
