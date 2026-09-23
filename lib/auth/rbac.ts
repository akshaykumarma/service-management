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

/**
 * Extends assertAccess with the Technician role's additional restriction (post-007
 * product feedback): a Technician gets the same access as any other store-scoped staff
 * member, but only for the one ticket a Service Manager has actually assigned them to —
 * every other role passes through unchanged. Centralized here, not duplicated per route
 * (research.md §2's "one scope-check function" principle), so every ticket-scoped route
 * enforces the assignment restriction the same way.
 */
export async function assertTicketAccess(
  user: SessionUser,
  ticket: { storeId: string; assignedTechnicianId: string | null },
): Promise<void> {
  await assertAccess(user, ticket.storeId);
  if (user.role === "technician" && ticket.assignedTechnicianId !== user.id) {
    throw new AccessDeniedError(`Technician ${user.id} is not assigned to ticket in store ${ticket.storeId}`);
  }
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
