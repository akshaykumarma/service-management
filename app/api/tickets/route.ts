import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { statusHistory, tickets, ticketPhotos } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { assertAccess, getScopedStoreIds, AccessDeniedError } from "@/lib/auth/rbac";
import { resolveCustomer } from "@/lib/tickets/customer";
import { nextTicketNumber } from "@/lib/tickets/ticket-number";
import { lookupHistory } from "@/lib/tickets/history";
import { MAX_PHOTOS_PER_TICKET } from "@/lib/tickets/photos";

const REQUIRED_FIELDS = ["storeId", "customerName", "customerPhone", "machineModel", "issueDescription"] as const;

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

    for (const objectKey of photoObjectKeys) {
      await tx.insert(ticketPhotos).values({
        ticketId: ticket.id,
        objectKey,
        contentType: "image/jpeg",
        sizeBytes: 0,
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

  const scope = await getScopedStoreIds(caller);
  const showAll = request.nextUrl.searchParams.get("includeCancelled") === "true";

  const conditions = [];
  if (scope !== "all") {
    if (scope.length === 0) {
      return NextResponse.json({ tickets: [] });
    }
    conditions.push(inArray(tickets.storeId, scope));
  }
  // Default active view excludes Cancelled tickets unless explicitly requested (US3, FR-016 edge case).
  if (!showAll) {
    conditions.push(ne(tickets.status, "cancelled"));
  }

  const rows = await db
    .select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      customerName: tickets.customerName,
      machineModel: tickets.machineModel,
      status: tickets.status,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tickets.createdAt));

  return NextResponse.json({ tickets: rows });
}
