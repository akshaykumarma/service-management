import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { statusHistory, stores, tickets, ticketPhotos, users } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertAccess, AccessDeniedError } from "@/lib/auth/rbac";
import { resolveCustomer } from "@/lib/tickets/customer";
import { nextTicketNumber } from "@/lib/tickets/ticket-number";
import { lookupHistory } from "@/lib/tickets/history";
import { MAX_PHOTOS_PER_TICKET, verifyUploadedObject } from "@/lib/tickets/photos";
import { queryScopedTickets } from "@/lib/board/ticket-query";
import { toTicketCard } from "@/lib/board/card-shape";
import type { TicketStatus } from "@/lib/tickets/status-transitions";

const REQUIRED_FIELDS = ["storeId", "customerName", "customerPhone", "machineModel", "serialNumber", "issueDescription"] as const;

export async function POST(request: NextRequest) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const payload = await request.json();

  for (const field of REQUIRED_FIELDS) {
    if (!payload[field] || typeof payload[field] !== "string" || payload[field].trim() === "") {
      return NextResponse.json(
        { error: { code: "missing_required_field", field } },
        { status: 400 },
      );
    }
  }

  const photoObjectKeys: string[] = Array.isArray(payload.photoObjectKeys) ? payload.photoObjectKeys : [];
  if (photoObjectKeys.length > MAX_PHOTOS_PER_TICKET) {
    return NextResponse.json({ error: { code: "too_many_photos" } }, { status: 400 });
  }

  try {
    await assertAccess(caller, payload.storeId);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  // 007-admin-console FR-009: a deactivated store must be excluded from new-ticket
  // creation, not just hidden from GET /api/stores' picker — enforced here too as
  // defense-in-depth against a client that bypasses the picker.
  const storeRows = await db.select({ active: stores.active }).from(stores).where(eq(stores.id, payload.storeId)).limit(1);
  if (!storeRows[0]?.active) {
    return NextResponse.json({ error: { code: "store_inactive" } }, { status: 409 });
  }

  // A presigned PUT URL constrains the signed Content-Type but not the actual body size
  // (research.md §5) — re-verify what was really uploaded before trusting it into the
  // ticket record; a mismatch deletes the object rather than persisting client-declared
  // metadata for it.
  const verifiedPhotos: { objectKey: string; contentType: string; sizeBytes: number }[] = [];
  for (const objectKey of photoObjectKeys) {
    const result = await verifyUploadedObject(objectKey);
    if (!result.ok) {
      return NextResponse.json({ error: { code: result.error, objectKey } }, { status: 400 });
    }
    verifiedPhotos.push({ objectKey, ...result.meta });
  }

  const created = await db.transaction(async (tx) => {
    const customer = await resolveCustomer(tx, { name: payload.customerName, phone: payload.customerPhone });
    const ticketNumber = await nextTicketNumber(tx, payload.storeId);

    const [ticket] = await tx
      .insert(tickets)
      .values({
        ticketNumber,
        storeId: payload.storeId,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        customerAltPhone: payload.customerAltPhone ?? null,
        customerId: customer.id,
        machineModel: payload.machineModel,
        serialNumber: payload.serialNumber,
        issueDescription: payload.issueDescription,
        estimatedPickupDate: payload.estimatedPickupDate ?? null,
        status: "open",
        createdBy: caller.id,
      })
      .returning();

    await tx.insert(statusHistory).values({
      ticketId: ticket.id,
      fromStatus: null,
      toStatus: "open",
      actorId: caller.id,
      comment: null,
    });

    for (const photo of verifiedPhotos) {
      await tx.insert(ticketPhotos).values({
        ticketId: ticket.id,
        objectKey: photo.objectKey,
        contentType: photo.contentType,
        sizeBytes: photo.sizeBytes,
      });
    }

    return ticket;
  });

  const history = await lookupHistory(caller, created.machineModel);

  return NextResponse.json(
    {
      ticket: {
        id: created.id,
        ticketNumber: created.ticketNumber,
        status: created.status,
        createdAt: created.createdAt,
      },
      history,
    },
    { status: 201 },
  );
}

export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  const params = request.nextUrl.searchParams;
  const storeIds = params.getAll("storeId");
  const statuses = params.getAll("status") as TicketStatus[];

  // 006-dashboard-reporting's board/filters (FR-008/FR-009) share this one scoped-query
  // function with 003's own pre-existing includeCancelled behavior (research.md §2) —
  // never two independent implementations of "which tickets can this caller see."
  const rows = await queryScopedTickets(caller, {
    storeIds: storeIds.length > 0 ? storeIds : undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    ticketId: params.get("ticketId") ?? undefined,
    customerName: params.get("customerName") ?? undefined,
    customerPhone: params.get("customerPhone") ?? undefined,
    machineModel: params.get("machineModel") ?? undefined,
    technicianId: params.get("technicianId") ?? undefined,
    includeCancelled: params.get("includeCancelled") === "true",
  });

  // Deviation (post-v1, per direct product feedback): this endpoint backs the board's
  // Kanban columns (not the Reports table, which is GET /api/reports/tickets and keeps
  // every historical ticket), so an older delivered ticket would otherwise sit in the
  // Delivered column forever. A ticket's `updatedAt` is only ever touched by a status
  // change (lib/tickets/status-transitions.ts), so — same precedent as this ticket's
  // own board-card daysOpen calculation (lib/board/card-shape.ts) — it doubles as "when
  // this ticket was delivered." Every other status/filter is unaffected; an older
  // delivered ticket is still fully visible via Reports' own date range.
  const visible = rows.filter((t) => t.status !== "delivered" || isCurrentMonth(t.updatedAt));

  // storeName/technicianName back the List view's table columns (the Kanban view doesn't
  // use them) — resolved the same batched way lib/reporting/ticket-details.ts already
  // does for Reports, rather than a per-ticket N+1 lookup.
  const storeIdsInView = [...new Set(visible.map((t) => t.storeId))];
  const technicianIdsInView = [...new Set(visible.map((t) => t.assignedTechnicianId).filter((id): id is string => id !== null))];

  const [storeRows, technicianRows] = await Promise.all([
    storeIdsInView.length > 0
      ? db.select({ id: stores.id, name: stores.name }).from(stores).where(inArray(stores.id, storeIdsInView))
      : Promise.resolve([] as { id: string; name: string }[]),
    technicianIdsInView.length > 0
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, technicianIdsInView))
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const storeNameById = new Map(storeRows.map((s) => [s.id, s.name]));
  const technicianNameById = new Map(technicianRows.map((t) => [t.id, t.name]));

  const cards = visible.map((t) => ({
    ...toTicketCard(t),
    storeId: t.storeId,
    storeName: storeNameById.get(t.storeId) ?? t.storeId,
    technicianName: t.assignedTechnicianId ? technicianNameById.get(t.assignedTechnicianId) ?? null : null,
  }));

  return NextResponse.json({ tickets: cards });
}

function isCurrentMonth(date: Date): boolean {
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
}
