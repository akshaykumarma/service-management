import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoTickets } from "@/lib/db/schema";
import { assertTicketAccess, AccessDeniedError } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";

const NOT_FOUND = () => NextResponse.json({ error: { code: "not_found", message: "No such demo ticket." } }, { status: 404 });

/**
 * Loads a demo ticket the caller may see, or the 404 response to return — the same "no
 * existence leak" rule and technician-assignment restriction (assertTicketAccess) as
 * service tickets.
 */
export async function loadAccessibleDemoTicket(
  caller: SessionUser,
  id: string,
): Promise<typeof demoTickets.$inferSelect | NextResponse> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NOT_FOUND();
  const [ticket] = await db.select().from(demoTickets).where(eq(demoTickets.id, id)).limit(1);
  if (!ticket) return NOT_FOUND();
  try {
    await assertTicketAccess(caller, ticket);
  } catch (err) {
    if (err instanceof AccessDeniedError) return NOT_FOUND();
    throw err;
  }
  return ticket;
}
