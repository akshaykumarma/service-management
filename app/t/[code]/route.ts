import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoTickets } from "@/lib/db/schema";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * A demo ticket's short link (FR-010), as sent to the technician on WhatsApp. Redirects
 * to the ticket page — through login first when there's no session, returning to the
 * ticket afterwards. Access to the ticket itself is still checked by the ticket page.
 */
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code;
  const [ticket] = /^[A-Za-z0-9]{4,32}$/.test(code)
    ? await db.select({ id: demoTickets.id }).from(demoTickets).where(eq(demoTickets.shortCode, code)).limit(1)
    : [];
  if (!ticket) return new NextResponse("Link not found.", { status: 404 });

  const target = `/demo-tickets/${ticket.id}`;
  const session = await getValidSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const location = session ? target : `/login?next=${encodeURIComponent(target)}`;
  // A relative Location, so the redirect stays on whatever public host (e.g. an ngrok
  // domain) the technician opened, regardless of what host the server thinks it has.
  return new NextResponse(null, { status: 302, headers: { location } });
}
