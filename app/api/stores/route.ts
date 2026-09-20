import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { getScopedStoreIds } from "@/lib/auth/rbac";

/**
 * Minimal store list, scoped to the caller's visibility — needed by this feature's own
 * ticket-intake form (a Service Manager/Admin/Super Admin must pick a storeId somewhere)
 * with no other feature yet providing one. 007-admin-console owns full store CRUD; this
 * stays a thin read-only list so it isn't duplicated once that lands.
 */
export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const scope = await getScopedStoreIds(sessionOrResponse.user);
  if (scope !== "all" && scope.length === 0) {
    return NextResponse.json({ stores: [] });
  }

  const rows = await db
    .select({ id: stores.id, name: stores.name })
    .from(stores)
    .where(scope === "all" ? undefined : inArray(stores.id, scope));

  return NextResponse.json({ stores: rows });
}
