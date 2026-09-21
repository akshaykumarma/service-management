import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, users, userStores } from "@/lib/db/schema";
import { hashPassword, generateTemporaryPassword } from "@/lib/auth/auth.config";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { AccessDeniedError, requireSuperAdmin } from "@/lib/auth/rbac";
import { requireSameOrigin } from "@/lib/auth/csrf";

export async function GET(request: NextRequest) {
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

  const rows = await db.select().from(users);
  const assignments = await db.select().from(userStores);
  const storeIdsByUser = new Map<string, string[]>();
  for (const a of assignments) {
    storeIdsByUser.set(a.userId, [...(storeIdsByUser.get(a.userId) ?? []), a.storeId]);
  }

  return NextResponse.json({
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      storeIds: storeIdsByUser.get(u.id) ?? [],
    })),
  });
}

export async function POST(request: NextRequest) {
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

  const { name, email, role, storeIds } = await request.json();

  if (role !== "admin" && role !== "service_manager") {
    return NextResponse.json(
      { error: { code: "invalid_role", message: "role must be admin or service_manager." } },
      { status: 400 },
    );
  }

  const ids: string[] = Array.isArray(storeIds) ? storeIds : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { error: { code: "store_assignment_required", message: "At least one store is required." } },
      { status: 400 },
    );
  }
  if (role === "service_manager" && ids.length !== 1) {
    return NextResponse.json(
      { error: { code: "invalid_store_count", message: "A Service Manager must have exactly one store." } },
      { status: 400 },
    );
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: { code: "email_already_registered", message: "That email is already registered." } },
      { status: 409 },
    );
  }

  const matchingStores = await db.select({ id: stores.id }).from(stores).where(inArray(stores.id, ids));
  if (matchingStores.length !== ids.length) {
    return NextResponse.json(
      { error: { code: "invalid_store_id", message: "One or more store ids do not exist." } },
      { status: 400 },
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name, email: normalizedEmail, passwordHash, role, active: true })
      .returning();

    for (const storeId of ids) {
      await tx.insert(userStores).values({ userId: user.id, storeId });
    }

    return user;
  });

  return NextResponse.json(
    {
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        active: created.active,
        storeIds: ids,
        temporaryPassword,
      },
    },
    { status: 201 },
  );
}
