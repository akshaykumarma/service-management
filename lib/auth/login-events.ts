import { db } from "@/lib/db/client";
import { loginEvents } from "@/lib/db/schema";

export type LoginOutcome = "success" | "failed" | "locked" | "deactivated" | "logout";

/** The caller's address as seen through the proxy chain (first hop), else the direct peer. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}

/**
 * Records one sign-in attempt or sign-out for the Super Admin "Login & activity" page.
 * Best-effort: a failure to write the record must never block someone from logging in or out.
 */
export async function recordLoginEvent(input: {
  userId: string | null;
  identifier: string;
  outcome: LoginOutcome;
  request: Request;
}): Promise<void> {
  try {
    await db.insert(loginEvents).values({
      userId: input.userId,
      identifier: input.identifier.slice(0, 254),
      outcome: input.outcome,
      ipAddress: clientIp(input.request),
      userAgent: input.request.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
  } catch (err) {
    console.error("Failed to record login event", err);
  }
}
