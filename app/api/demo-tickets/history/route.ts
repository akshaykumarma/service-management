import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { lookupDemoHistory } from "@/lib/demo/history";

/** Live serial/invoice history + repeat-demo warning for the New Ticket form (FR-007). */
export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;
  const params = request.nextUrl.searchParams;
  const result = await lookupDemoHistory(sessionOrResponse.user, {
    serialNumber: params.get("serialNumber"),
    invoiceNumber: params.get("invoiceNumber"),
    excludeId: params.get("excludeId"),
  });
  return NextResponse.json(result);
}
