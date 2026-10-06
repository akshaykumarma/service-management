import { and, desc, eq, gt, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import {
  auditLog,
  demoTicketStatusHistory,
  demoTickets,
  loginEvents,
  sessions,
  statusHistory,
  tickets,
  users,
} from "@/lib/db/schema";

/**
 * The Super Admin "Login & activity" feed: sign-ins/outs from login_events merged with what
 * people changed (audit_log, service and demo status history), newest first.
 */

export type ActivityKind = "login" | "change";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  at: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  /** For sign-in attempts: what was typed (may not match any user). */
  identifier: string | null;
  outcome: string | null;
  description: string;
  link: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ActivityFilters {
  userId?: string;
  kind?: ActivityKind;
  /** YYYY-MM-DD, inclusive, in the stores' time zone (Asia/Kolkata). */
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateParam(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00+05:30`));
}

/** Start of the given business day (IST) as an instant. */
function istDayStart(value: string): Date {
  return new Date(`${value}T00:00:00+05:30`);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

const SERVICE_STATUS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const DEMO_STATUS: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const LOGIN_DESCRIPTIONS: Record<string, string> = {
  success: "Signed in",
  failed: "Failed sign-in (wrong email/username or password)",
  locked: "Sign-in blocked — too many failed attempts",
  deactivated: "Sign-in refused — account deactivated",
  logout: "Signed out",
};

function changedFields(before: unknown, after: unknown): string[] {
  if (!after || typeof after !== "object") return [];
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  return Object.entries(after as Record<string, unknown>)
    .filter(([key, value]) => JSON.stringify(b[key]) !== JSON.stringify(value))
    .map(([key]) => key)
    .filter((key) => !/hash|password/i.test(key));
}

function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function timeRange(column: PgColumn, filters: ActivityFilters): SQL[] {
  const conditions: SQL[] = [];
  if (filters.dateFrom) conditions.push(gte(column, istDayStart(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lt(column, addDays(istDayStart(filters.dateTo), 1)));
  return conditions;
}

export async function listActivity(filters: ActivityFilters = {}): Promise<ActivityEntry[]> {
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const entries: ActivityEntry[] = [];

  if (filters.kind !== "change") {
    const conditions: SQL[] = [...timeRange(loginEvents.createdAt, filters)];
    if (filters.userId) conditions.push(eq(loginEvents.userId, filters.userId));
    const rows = await db
      .select({
        id: loginEvents.id,
        at: loginEvents.createdAt,
        userId: loginEvents.userId,
        userName: users.name,
        userRole: users.role,
        identifier: loginEvents.identifier,
        outcome: loginEvents.outcome,
        ipAddress: loginEvents.ipAddress,
        userAgent: loginEvents.userAgent,
      })
      .from(loginEvents)
      .leftJoin(users, eq(users.id, loginEvents.userId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(loginEvents.createdAt))
      .limit(limit);
    for (const row of rows) {
      entries.push({
        id: `login:${row.id}`,
        kind: "login",
        at: row.at.toISOString(),
        userId: row.userId,
        userName: row.userName,
        userRole: row.userRole,
        identifier: row.identifier,
        outcome: row.outcome,
        description: LOGIN_DESCRIPTIONS[row.outcome] ?? row.outcome,
        link: null,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
      });
    }
  }

  if (filters.kind !== "login") {
    // Edits recorded in the audit log.
    const auditConditions: SQL[] = [...timeRange(auditLog.ts, filters)];
    if (filters.userId) auditConditions.push(eq(auditLog.actorId, filters.userId));
    const auditRows = await db
      .select({
        id: auditLog.id,
        at: auditLog.ts,
        actorId: auditLog.actorId,
        actorName: users.name,
        actorRole: users.role,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        action: auditLog.action,
        before: auditLog.beforeJson,
        after: auditLog.afterJson,
      })
      .from(auditLog)
      .innerJoin(users, eq(users.id, auditLog.actorId))
      .where(auditConditions.length ? and(...auditConditions) : undefined)
      .orderBy(desc(auditLog.ts))
      .limit(limit);

    const idsOf = (type: string) => [...new Set(auditRows.filter((r) => r.entityType === type).map((r) => r.entityId))];
    const userIds = idsOf("user");
    const ticketIds = idsOf("ticket");
    const demoIds = idsOf("demo_ticket");
    const [userNames, ticketNumbers, demoNumbers] = await Promise.all([
      userIds.length
        ? db.select({ id: users.id, label: users.name }).from(users).where(inArray(users.id, userIds))
        : [],
      ticketIds.length
        ? db.select({ id: tickets.id, label: tickets.ticketNumber }).from(tickets).where(inArray(tickets.id, ticketIds))
        : [],
      demoIds.length
        ? db
            .select({ id: demoTickets.id, label: demoTickets.ticketNumber })
            .from(demoTickets)
            .where(inArray(demoTickets.id, demoIds))
        : [],
    ]);
    const labels = new Map<string, string>([...userNames, ...ticketNumbers, ...demoNumbers].map((r) => [r.id, r.label]));

    for (const row of auditRows) {
      const label = labels.get(row.entityId) ?? "(deleted)";
      const fields = changedFields(row.before, row.after).map(humanize);
      const fieldNote = fields.length ? ` (${fields.join(", ")})` : "";
      let description: string;
      let link: string | null = null;
      if (row.entityType === "user" && row.action === "reset_password") {
        description = `Reset the password of user ${label}`;
      } else if (row.entityType === "user") {
        description = `Updated user ${label}${fieldNote}`;
      } else if (row.entityType === "ticket") {
        description = `Edited service ticket ${label}${fieldNote}`;
        link = `/tickets/${row.entityId}`;
      } else if (row.entityType === "demo_ticket" && row.action === "demo_ticket_assigned") {
        description = `Changed the technician on demo ticket ${label}`;
        link = `/demo-tickets/${row.entityId}`;
      } else if (row.entityType === "demo_ticket") {
        description = `Edited demo ticket ${label}${fieldNote}`;
        link = `/demo-tickets/${row.entityId}`;
      } else {
        description = `${humanize(row.action)} — ${humanize(row.entityType)} ${label}`;
      }
      entries.push({
        id: `audit:${row.id}`,
        kind: "change",
        at: row.at.toISOString(),
        userId: row.actorId,
        userName: row.actorName,
        userRole: row.actorRole,
        identifier: null,
        outcome: null,
        description,
        link,
        ipAddress: null,
        userAgent: null,
      });
    }

    // Service ticket status changes (and creation).
    const statusConditions: SQL[] = [...timeRange(statusHistory.createdAt, filters)];
    if (filters.userId) statusConditions.push(eq(statusHistory.actorId, filters.userId));
    const statusRows = await db
      .select({
        id: statusHistory.id,
        at: statusHistory.createdAt,
        actorId: statusHistory.actorId,
        actorName: users.name,
        actorRole: users.role,
        ticketId: statusHistory.ticketId,
        ticketNumber: tickets.ticketNumber,
        fromStatus: statusHistory.fromStatus,
        toStatus: statusHistory.toStatus,
        comment: statusHistory.comment,
      })
      .from(statusHistory)
      .innerJoin(users, eq(users.id, statusHistory.actorId))
      .innerJoin(tickets, eq(tickets.id, statusHistory.ticketId))
      .where(statusConditions.length ? and(...statusConditions) : undefined)
      .orderBy(desc(statusHistory.createdAt))
      .limit(limit);
    for (const row of statusRows) {
      const comment = row.comment ? ` — "${row.comment}"` : "";
      entries.push({
        id: `status:${row.id}`,
        kind: "change",
        at: row.at.toISOString(),
        userId: row.actorId,
        userName: row.actorName,
        userRole: row.actorRole,
        identifier: null,
        outcome: null,
        description: row.fromStatus
          ? `Moved service ticket ${row.ticketNumber} from ${SERVICE_STATUS[row.fromStatus] ?? row.fromStatus} to ${SERVICE_STATUS[row.toStatus] ?? row.toStatus}${comment}`
          : `Created service ticket ${row.ticketNumber}`,
        link: `/tickets/${row.ticketId}`,
        ipAddress: null,
        userAgent: null,
      });
    }

    // Demo ticket status changes (and creation).
    const demoConditions: SQL[] = [...timeRange(demoTicketStatusHistory.createdAt, filters)];
    if (filters.userId) demoConditions.push(eq(demoTicketStatusHistory.actorId, filters.userId));
    const demoRows = await db
      .select({
        id: demoTicketStatusHistory.id,
        at: demoTicketStatusHistory.createdAt,
        actorId: demoTicketStatusHistory.actorId,
        actorName: users.name,
        actorRole: users.role,
        demoTicketId: demoTicketStatusHistory.demoTicketId,
        ticketNumber: demoTickets.ticketNumber,
        fromStatus: demoTicketStatusHistory.fromStatus,
        toStatus: demoTicketStatusHistory.toStatus,
        comment: demoTicketStatusHistory.comment,
      })
      .from(demoTicketStatusHistory)
      .innerJoin(users, eq(users.id, demoTicketStatusHistory.actorId))
      .innerJoin(demoTickets, eq(demoTickets.id, demoTicketStatusHistory.demoTicketId))
      .where(demoConditions.length ? and(...demoConditions) : undefined)
      .orderBy(desc(demoTicketStatusHistory.createdAt))
      .limit(limit);
    for (const row of demoRows) {
      const comment = row.comment ? ` — "${row.comment}"` : "";
      entries.push({
        id: `demo-status:${row.id}`,
        kind: "change",
        at: row.at.toISOString(),
        userId: row.actorId,
        userName: row.actorName,
        userRole: row.actorRole,
        identifier: null,
        outcome: null,
        description: row.fromStatus
          ? `Moved demo ticket ${row.ticketNumber} from ${DEMO_STATUS[row.fromStatus] ?? row.fromStatus} to ${DEMO_STATUS[row.toStatus] ?? row.toStatus}${comment}`
          : `Created demo ticket ${row.ticketNumber}`,
        link: `/demo-tickets/${row.demoTicketId}`,
        ipAddress: null,
        userAgent: null,
      });
    }
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

export interface SignedInUser {
  userId: string;
  name: string;
  role: string;
  sessions: number;
  lastActiveAt: string;
}

/** Users with at least one unexpired session, most recently active first. */
export async function listSignedInUsers(now: Date = new Date()): Promise<SignedInUser[]> {
  const idleHours = Number(process.env.SESSION_IDLE_TIMEOUT_HOURS ?? "8");
  const idleCutoff = new Date(now.getTime() - idleHours * 60 * 60 * 1000);
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      role: users.role,
      sessions: sql<number>`count(*)::int`,
      lastActiveAt: sql<Date>`max(${sessions.lastActiveAt})`,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(gt(sessions.expiresAt, now), gt(sessions.lastActiveAt, idleCutoff), eq(users.active, true)))
    .groupBy(users.id, users.name, users.role)
    .orderBy(desc(sql`max(${sessions.lastActiveAt})`));
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    role: r.role,
    sessions: r.sessions,
    lastActiveAt: new Date(r.lastActiveAt).toISOString(),
  }));
}
