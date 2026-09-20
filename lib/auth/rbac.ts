import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userStores } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/session";

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

/**
 * Returns "all" for a super_admin (global scope implied, FR-004), otherwise the exact
 * set of store ids this user is assigned to (empty array if none).
 */
export async function getScopedStoreIds(user: SessionUser): Promise<string[] | "all"> {
  if (user.role === "super_admin") return "all";

  const rows = await db
    .select({ storeId: userStores.storeId })
    .from(userStores)
    .where(eq(userStores.userId, user.id));

  return rows.map((r) => r.storeId);
}

/**
 * The one scope-check function every store-scoped route/page calls (plan.md's Simplicity
 * & YAGNI rationale — a single function, not a permission framework). Re-evaluates the
 * user's current store assignment live against the database on every call; never caches
 * scope at login (FR-019).
 */
export async function assertAccess(user: SessionUser, storeId: string): Promise<void> {
  const scope = await getScopedStoreIds(user);
  if (scope === "all") return;
  if (scope.includes(storeId)) return;
  throw new AccessDeniedError(`User ${user.id} does not have access to store ${storeId}`);
}

/** Guards routes/screens restricted to the Super Admin role (e.g., user management, FR-011). */
export function requireSuperAdmin(user: SessionUser): void {
  if (user.role !== "super_admin") {
    throw new AccessDeniedError("This action requires the Super Admin role.");
  }
}

/** Guards routes/screens restricted to Admin and Super Admin (e.g., 007's maintenance console). */
export function requireAdminOrAbove(user: SessionUser): void {
  if (user.role !== "super_admin" && user.role !== "admin") {
    throw new AccessDeniedError("This action requires the Admin or Super Admin role.");
  }
}
