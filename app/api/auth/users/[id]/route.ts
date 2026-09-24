import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, stores, users, userStores } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { AccessDeniedError, getScopedStoreIds, requireAdminOrAbove, requireSuperAdmin } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireSameOrigin } from "@/lib/auth/csrf";

async function requireSuperAdminSession(request: NextRequest) {
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
  return sessionOrResponse;
}

async function requireAdminOrAboveSession(request: NextRequest) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  try {
    requireAdminOrAbove(sessionOrResponse.user);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }
  return sessionOrResponse;
}

async function getStoreIds(userId: string): Promise<string[]> {
  const rows = await db.select({ storeId: userStores.storeId }).from(userStores).where(eq(userStores.userId, userId));
  return rows.map((r) => r.storeId);
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const sessionOrResponse = await requireAdminOrAboveSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const actor = sessionOrResponse.user;

  const targetRows = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
  const target = targetRows[0];
  if (!target) {
    return NextResponse.json({ error: { code: "not_found", message: "No such user." } }, { status: 404 });
  }

  // An Admin edits Service Managers/Technicians within their own stores — the same
  // boundary GET /api/auth/users and the reset-password route already enforce. An
  // out-of-scope or wrong-role target 404s rather than 403s, consistent with this app's
  // "can't act on what you can't see" convention.
  if (actor.role === "admin") {
    const targetStoreIds = await getStoreIds(target.id);
    const actorScope = await getScopedStoreIds(actor);
    const inScope =
      (target.role === "service_manager" || target.role === "technician") &&
      actorScope !== "all" &&
      targetStoreIds.some((id) => actorScope.includes(id));
    if (!inScope) {
      return NextResponse.json({ error: { code: "not_found", message: "No such user." } }, { status: 404 });
    }
  }

  const patch: {
    name?: string;
    role?: "admin" | "service_manager" | "technician";
    active?: boolean;
    storeIds?: string[];
  } = await request.json();

  if (actor.role === "admin" && patch.role !== undefined && patch.role !== "service_manager" && patch.role !== "technician") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "An Admin can only assign the Service Manager or Technician role." } },
      { status: 403 },
    );
  }

  const resultingRole = patch.role ?? target.role;
  const resultingActive = patch.active ?? target.active;
  const currentStoreIds = await getStoreIds(target.id);
  const resultingStoreIds = patch.storeIds ?? currentStoreIds;

  if ((resultingRole === "service_manager" || resultingRole === "technician") && resultingStoreIds.length !== 1) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_store_count",
          message: "A Service Manager or Technician must have exactly one store.",
        },
      },
      { status: 400 },
    );
  }

  if (patch.storeIds !== undefined && patch.storeIds.length > 0) {
    const matchingStores = await db.select({ id: stores.id }).from(stores).where(inArray(stores.id, patch.storeIds));
    if (matchingStores.length !== patch.storeIds.length) {
      return NextResponse.json(
        { error: { code: "invalid_store_id", message: "One or more store ids do not exist." } },
        { status: 400 },
      );
    }
  }

  if (actor.role === "admin") {
    const actorScope = await getScopedStoreIds(actor);
    if (actorScope !== "all" && !resultingStoreIds.every((id) => actorScope.includes(id))) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "An Admin can only assign stores within their own scope." } },
        { status: 403 },
      );
    }
  }

  const losingActiveSuperAdminStatus =
    target.role === "super_admin" &&
    target.active === true &&
    (resultingActive === false || resultingRole !== "super_admin");

  if (losingActiveSuperAdminStatus) {
    const otherActiveSuperAdmins = await db
      .select()
      .from(users)
      .where(and(eq(users.role, "super_admin"), eq(users.active, true), ne(users.id, target.id)));
    if (otherActiveSuperAdmins.length === 0) {
      return NextResponse.json(
        { error: { code: "last_super_admin", message: "Cannot remove the last active Super Admin." } },
        { status: 409 },
      );
    }
  }

  const before = { ...target, storeIds: currentStoreIds };

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, target.id))
      .returning();

    if (patch.storeIds !== undefined) {
      await tx.delete(userStores).where(eq(userStores.userId, target.id));
      for (const storeId of patch.storeIds) {
        await tx.insert(userStores).values({ userId: target.id, storeId });
      }
    }

    await writeAuditLog(tx, {
      actorId: actor.id,
      entityType: "user",
      entityId: target.id,
      action: "update",
      before,
      after: { ...row, storeIds: resultingStoreIds },
    });

    return row;
  });

  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      active: updated.active,
      storeIds: resultingStoreIds,
    },
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const sessionOrResponse = await requireSuperAdminSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const targetRows = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
  const target = targetRows[0];
  if (!target) {
    return NextResponse.json({ error: { code: "not_found", message: "No such user." } }, { status: 404 });
  }

  // "History" here means any audit_log row attributing an action to this user. Later
  // features (tickets, notifications, ...) add their own attribution sources this check
  // will need to broaden to — an expected consequence of building features in sequence,
  // not a gap introduced by this one.
  const history = await db.select().from(auditLog).where(eq(auditLog.actorId, target.id)).limit(1);
  if (history.length > 0) {
    return NextResponse.json(
      { error: { code: "has_history_use_deactivate", message: "This user has history; deactivate instead." } },
      { status: 409 },
    );
  }

  await db.delete(users).where(eq(users.id, target.id));
  return new NextResponse(null, { status: 204 });
}
