import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSuperAdmin, AccessDeniedError } from "@/lib/auth/rbac";
import { isValidDateParam, listActivity, listSignedInUsers, type ActivityKind } from "@/lib/admin/activity-log";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Super Admin only: sign-ins/outs and changes made by everyone, plus who is signed in now. */
export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  try {
    requireSuperAdmin(sessionOrResponse.user);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  const params = request.nextUrl.searchParams;
  const userId = params.get("userId") || undefined;
  const kindParam = params.get("kind") || undefined;
  const dateFrom = params.get("dateFrom") || undefined;
  const dateTo = params.get("dateTo") || undefined;

  if (userId && !UUID_RE.test(userId)) {
    return NextResponse.json({ error: { code: "invalid_field", field: "userId" } }, { status: 400 });
  }
  if (kindParam && kindParam !== "login" && kindParam !== "change") {
    return NextResponse.json({ error: { code: "invalid_field", field: "kind" } }, { status: 400 });
  }
  for (const [field, value] of [["dateFrom", dateFrom], ["dateTo", dateTo]] as const) {
    if (value && !isValidDateParam(value)) {
      return NextResponse.json({ error: { code: "invalid_field", field } }, { status: 400 });
    }
  }

  const [entries, signedIn, people] = await Promise.all([
    listActivity({ userId, kind: kindParam as ActivityKind | undefined, dateFrom, dateTo }),
    listSignedInUsers(),
    db.select({ id: users.id, name: users.name, role: users.role }).from(users).orderBy(asc(users.name)),
  ]);

  return NextResponse.json({ entries, signedIn, users: people });
}
