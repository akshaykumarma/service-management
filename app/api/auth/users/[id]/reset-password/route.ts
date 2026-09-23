import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userStores, users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/auth.config";
import { isValidPassword } from "@/lib/auth/password-policy";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { getScopedStoreIds } from "@/lib/auth/rbac";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { deleteAllSessionsForUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/audit";

async function getStoreIds(userId: string): Promise<string[]> {
  const rows = await db.select({ storeId: userStores.storeId }).from(userStores).where(eq(userStores.userId, userId));
  return rows.map((r) => r.storeId);
}

/**
 * Lets a Super Admin reset any staff account's password, and an Admin reset a Store
 * Service Manager's or Technician's password within their own store(s) — the same visibility boundary
 * GET /api/auth/users already enforces for Admins. An out-of-scope or wrong-role target
 * 404s rather than 403s, consistent with this app's "can't act on what you can't see"
 * convention elsewhere (e.g. the audit-trail route), rather than confirming the id exists.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  if (caller.role !== "super_admin" && caller.role !== "admin") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "This action requires the Admin or Super Admin role." } },
      { status: 403 },
    );
  }

  const targetRows = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
  const target = targetRows[0];
  if (!target) {
    return NextResponse.json({ error: { code: "not_found", message: "No such user." } }, { status: 404 });
  }

  if (caller.role === "admin") {
    const targetStoreIds = await getStoreIds(target.id);
    const callerScope = await getScopedStoreIds(caller);
    const inScope =
      (target.role === "service_manager" || target.role === "technician") &&
      callerScope !== "all" &&
      targetStoreIds.some((id) => callerScope.includes(id));
    if (!inScope) {
      return NextResponse.json({ error: { code: "not_found", message: "No such user." } }, { status: 404 });
    }
  }

  const { password } = await request.json();
  if (!isValidPassword(password)) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_password",
          message: "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a special character.",
        },
      },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, target.id));
    await writeAuditLog(tx, {
      actorId: caller.id,
      entityType: "user",
      entityId: target.id,
      action: "reset_password",
      before: { passwordChanged: false },
      after: { passwordChanged: true },
    });
  });

  // A reset implies "credentials may need rotating" — the same deliberate exception to
  // FR-019's "no explicit session termination" that self-service reset already uses
  // (app/api/auth/password-reset/confirm/route.ts).
  await deleteAllSessionsForUser(target.id);

  return NextResponse.json({ message: "Password reset." });
}
