import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";

export { SESSION_COOKIE_NAME } from "@/lib/auth/session-constants";

const ABSOLUTE_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getIdleTimeoutMs(): number {
  const hours = Number(process.env.SESSION_IDLE_TIMEOUT_HOURS ?? "8");
  return hours * 60 * 60 * 1000;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "service_manager" | "technician";
  active: boolean;
}

export interface ValidSession {
  sessionToken: string;
  user: SessionUser;
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ABSOLUTE_SESSION_LIFETIME_MS);

  await db.insert(sessions).values({
    sessionToken: token,
    userId,
    expiresAt,
    lastActiveAt: now,
  });

  return { token, expiresAt };
}

/**
 * The one place session validity is decided (FR-019): a session is valid only if it
 * hasn't hit its absolute expiry, hasn't been idle past the configured timeout, AND the
 * joined user is currently active — evaluated fresh on every call, never cached.
 */
export async function getValidSession(token: string | undefined | null): Promise<ValidSession | null> {
  if (!token) return null;

  const rows = await db
    .select({
      sessionToken: sessions.sessionToken,
      expiresAt: sessions.expiresAt,
      lastActiveAt: sessions.lastActiveAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.sessionToken, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  if (now >= row.expiresAt.getTime()) return null;
  if (now - row.lastActiveAt.getTime() >= getIdleTimeoutMs()) return null;
  if (!row.active) return null;

  // Sliding idle window: touch last_active_at on every valid, authorized use.
  await db
    .update(sessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(sessions.sessionToken, token));

  return {
    sessionToken: row.sessionToken,
    user: {
      id: row.userId,
      name: row.name,
      email: row.email,
      role: row.role,
      active: row.active,
    },
  };
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.sessionToken, token));
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
