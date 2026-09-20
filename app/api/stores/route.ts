import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { getScopedStoreIds } from "@/lib/auth/rbac";

/**
 * Minimal store list, scoped to the caller's visibility — needed by the ticket-intake
 * form (a Service Manager/Admin/Super Admin must pick a storeId somewhere).
 * 007-admin-console owns full store CRUD (Super-Admin-only) at /api/admin/stores; this
 * stays a thin, any-role read list so intake isn't blocked by that gate. Active-only
 * (FR-009): a deactivated store must not be selectable for new ticket creation.
 */
export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const scope = await getScopedStoreIds(sessionOrResponse.user);
  if (scope !== "all" && scope.length === 0) {
    return NextResponse.json({ stores: [] });
  }

  const activeCondition = eq(stores.active, true);
  const rows = await db
    .select({ id: stores.id, name: stores.name })
    .from(stores)
    .where(scope === "all" ? activeCondition : and(activeCondition, inArray(stores.id, scope)));

  return NextResponse.json({ stores: rows });
}
