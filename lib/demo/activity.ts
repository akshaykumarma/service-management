import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, demoTicketStatusHistory, notifications, users } from "@/lib/db/schema";
import { DEMO_FIELD_LABELS } from "@/lib/demo/edit-details";
import { formatDate } from "@/lib/format/date";

export interface DemoActivityEntry {
  source: "status" | "edit" | "assignment" | "notification";
  actor: string | null;
  timestamp: Date;
  description: string;
}

const LABELS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
const label = (s: string) => LABELS[s] ?? s;
const shown = (field: string, value: unknown) =>
  value == null ? "" : field === "demoDate" ? formatDate(String(value)) : String(value);

/** Everything recorded for one demo ticket (FR-012), oldest first. */
export async function getDemoActivity(demoTicketId: string): Promise<DemoActivityEntry[]> {
  const entries: DemoActivityEntry[] = [];

  const history = await db
    .select({ from: demoTicketStatusHistory.fromStatus, to: demoTicketStatusHistory.toStatus, comment: demoTicketStatusHistory.comment, at: demoTicketStatusHistory.createdAt, actor: users.name })
    .from(demoTicketStatusHistory)
    .innerJoin(users, eq(users.id, demoTicketStatusHistory.actorId))
    .where(eq(demoTicketStatusHistory.demoTicketId, demoTicketId));
  for (const h of history) {
    entries.push({
      source: "status",
      actor: h.actor,
      timestamp: h.at,
      description: h.from
        ? `Status changed from ${label(h.from)} to ${label(h.to)}${h.comment ? ` — "${h.comment}"` : ""}`
        : "Demo ticket created (New)",
    });
  }

  const audits = await db
    .select({ action: auditLog.action, before: auditLog.beforeJson, after: auditLog.afterJson, at: auditLog.ts, actor: users.name })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(and(eq(auditLog.entityType, "demo_ticket"), eq(auditLog.entityId, demoTicketId)));
  for (const a of audits) {
    const before = (a.before ?? {}) as Record<string, unknown>;
    const after = (a.after ?? {}) as Record<string, unknown>;
    if (a.action === "demo_ticket_assigned") {
      entries.push({
        source: "assignment",
        actor: a.actor,
        timestamp: a.at,
        description: after.technicianName ? `Technician assigned: ${after.technicianName}` : "Technician removed",
      });
    } else {
      const changes = Object.keys(after).map(
        (f) => `${DEMO_FIELD_LABELS[f] ?? f}: "${shown(f, before[f])}" → "${shown(f, after[f])}"`,
      );
      entries.push({ source: "edit", actor: a.actor, timestamp: a.at, description: `Details edited — ${changes.join("; ")}` });
    }
  }

  const sent = await db.select().from(notifications).where(eq(notifications.demoTicketId, demoTicketId));
  for (const n of sent) {
    entries.push({
      source: "notification",
      actor: null,
      timestamp: n.sentAt,
      description: `WhatsApp to technician (${n.recipientPhone}) ${n.status === "failed" ? "failed" : "sent"}`,
    });
  }

  return entries.sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime());
}
