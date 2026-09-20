import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { machineModels } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";

/**
 * Minimal active-model list for the intake dropdown (003-ticket-lifecycle), open to any
 * authenticated role — same precedent as GET /api/stores: the admin console's own
 * GET /api/admin/machine-models is Super-Admin-only and returns full CRUD detail, so it
 * can't serve this purpose. `tickets.machine_model` stays free text with no FK
 * (003's own design), so this is a suggestion list, not a constraint.
 */
export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const rows = await db
    .select({ id: machineModels.id, name: machineModels.name })
    .from(machineModels)
    .where(eq(machineModels.active, true));

  return NextResponse.json({ machineModels: rows });
}
