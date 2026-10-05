import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { loadAccessibleDemoTicket } from "@/lib/demo/route-helpers";
import { getDemoActivity } from "@/lib/demo/activity";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const ticket = await loadAccessibleDemoTicket(sessionOrResponse.user, params.id);
  if (ticket instanceof NextResponse) return ticket;
  return NextResponse.json({ entries: await getDemoActivity(ticket.id) });
}
