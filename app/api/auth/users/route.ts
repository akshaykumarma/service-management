import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, users, userStores } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/auth.config";
import { isValidEmail } from "@/lib/auth/email-validation";
import { DEFAULT_TECHNICIAN_PASSWORD, isValidPassword } from "@/lib/auth/password-policy";
import { isValidUsername } from "@/lib/auth/username-validation";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { AccessDeniedError, getScopedStoreIds, requireAdminOrAbove } from "@/lib/auth/rbac";
import { requireSameOrigin } from "@/lib/auth/csrf";

export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const caller = sessionOrResponse.user;

  try {
    requireAdminOrAbove(caller);
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

  // An Admin only manages Service Managers and Technicians within their own stores
  // (password-reset scope below enforces the same boundary) — a Super Admin sees everyone.
  const scope = caller.role === "super_admin" ? "all" : await getScopedStoreIds(caller);
  const visible = rows.filter((u) => {
    if (scope === "all") return true;
    if (u.role !== "service_manager" && u.role !== "technician") return false;
    return (storeIdsByUser.get(u.id) ?? []).some((id) => scope.includes(id));
  });

  return NextResponse.json({
    users: visible.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username,
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
  const caller = sessionOrResponse.user;

  try {
    requireAdminOrAbove(caller);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  const { name, email, username, role, storeIds, password } = await request.json();

  if (role !== "admin" && role !== "service_manager" && role !== "technician") {
    return NextResponse.json(
      { error: { code: "invalid_role", message: "role must be admin, service_manager, or technician." } },
      { status: 400 },
    );
  }

  // An Admin manages Service Managers/Technicians within their own stores (the same
  // boundary GET /api/auth/users and the reset-password route already enforce) — they
  // can't create another Admin, and only a Super Admin's own seeding step creates one.
  if (caller.role === "admin" && role !== "service_manager" && role !== "technician") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "An Admin can only create Service Manager or Technician accounts." } },
      { status: 403 },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: { code: "invalid_email", message: "Enter a valid email address." } },
      { status: 400 },
    );
  }

  // Optional: login accepts either email or username (post-002-auth-rbac product
  // feedback), but not every account needs one.
  const normalizedUsername =
    username === undefined || username === null || username === "" ? null : String(username).trim().toLowerCase();
  if (normalizedUsername !== null && !isValidUsername(normalizedUsername)) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_username",
          message: "Username must be 3-32 characters: letters, digits, dots, underscores, or hyphens only.",
        },
      },
      { status: 400 },
    );
  }

  // Deviation from contracts/auth-api.md's original design (a system-generated one-time
  // password relayed by the Super Admin): the Super Admin now sets the account's initial
  // password directly, so there's no "relay this" step. Same complexity rule as
  // password-reset (lib/auth/password-policy.ts) — one policy, not a stricter one here.
  //
  // Deviation (post-v1, per direct product feedback): a Technician's password is optional
  // at creation — an omitted/blank one falls back to DEFAULT_TECHNICIAN_PASSWORD rather
  // than being rejected. Every other role still requires an explicit password.
  const isBlank = password === undefined || password === null || password === "";
  const effectivePassword = isBlank && role === "technician" ? DEFAULT_TECHNICIAN_PASSWORD : password;
  if (!isValidPassword(effectivePassword)) {
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

  const ids: string[] = Array.isArray(storeIds) ? storeIds : [];
  if (ids.length === 0) {
    return NextResponse.json(
      { error: { code: "store_assignment_required", message: "At least one store is required." } },
      { status: 400 },
    );
  }
  if ((role === "service_manager" || role === "technician") && ids.length !== 1) {
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

  if (caller.role === "admin") {
    const callerScope = await getScopedStoreIds(caller);
    if (callerScope !== "all" && !ids.every((id) => callerScope.includes(id))) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "An Admin can only assign stores within their own scope." } },
        { status: 403 },
      );
    }
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: { code: "email_already_registered", message: "That email is already registered." } },
      { status: 409 },
    );
  }

  if (normalizedUsername !== null) {
    const existingUsername = await db.select().from(users).where(eq(users.username, normalizedUsername)).limit(1);
    if (existingUsername.length > 0) {
      return NextResponse.json(
        { error: { code: "username_already_registered", message: "That username is already taken." } },
        { status: 409 },
      );
    }
  }

  const matchingStores = await db.select({ id: stores.id }).from(stores).where(inArray(stores.id, ids));
  if (matchingStores.length !== ids.length) {
    return NextResponse.json(
      { error: { code: "invalid_store_id", message: "One or more store ids do not exist." } },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(effectivePassword);

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name, email: normalizedEmail, username: normalizedUsername, passwordHash, role, active: true })
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
        username: created.username,
        role: created.role,
        active: created.active,
        storeIds: ids,
      },
    },
    { status: 201 },
  );
}
