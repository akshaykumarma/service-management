import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userStores, users } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { getScopedStoreIds } from "@/lib/auth/rbac";

/**
 * Active technicians within the caller's visible store scope — for the board's and
 * Reports table's "filter by technician" pickers (post-post-007 product feedback: a
 * technicianId filter needs a caller-wide list, not just one ticket's own store the way
 * GET /api/tickets/:id/technicians is scoped). Same "any authenticated role, scope-only"
 * pattern as GET /api/stores.
 */
export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const scope = await getScopedStoreIds(sessionOrResponse.user);
  if (scope !== "all" && scope.length === 0) {
    return NextResponse.json({ technicians: [] });
  }

  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userStores, eq(userStores.userId, users.id))
    .where(
      and(
        eq(users.role, "technician"),
        eq(users.active, true),
        scope === "all" ? undefined : inArray(userStores.storeId, scope),
      ),
    );

  // A technician could show up once per assigned store; de-dupe by id.
  const seen = new Set<string>();
  const technicians = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

  return NextResponse.json({ technicians });
}
