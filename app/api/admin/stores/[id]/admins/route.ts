import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, userStores, users } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { requireSuperAdmin, AccessDeniedError } from "@/lib/auth/rbac";

/**
 * Writes directly to 002-auth-rbac's existing user_stores table (research.md §3) — a UI
 * convenience over that feature's own data, not a second assignment mechanism.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  try {
    requireSuperAdmin(sessionOrResponse.user);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  const storeRows = await db.select().from(stores).where(eq(stores.id, params.id)).limit(1);
  if (!storeRows[0]) {
    return NextResponse.json({ error: { code: "not_found", message: "No such store." } }, { status: 404 });
  }

  const { userId } = await request.json();
  const targetRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const target = targetRows[0];

  // This endpoint assigns Admins only — a Store Service Manager is limited to exactly
  // one store via 002's own creation/edit rules, not this convenience entry point.
  if (!target || target.role !== "admin") {
    return NextResponse.json({ error: { code: "user_not_admin_role" } }, { status: 404 });
  }

  await db.insert(userStores).values({ userId, storeId: params.id }).onConflictDoNothing();

  return new NextResponse(null, { status: 201 });
}
