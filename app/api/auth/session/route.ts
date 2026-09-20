import { NextRequest, NextResponse } from "next/server";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { getScopedStoreIds } from "@/lib/auth/rbac";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(token);

  if (!session) {
    return NextResponse.json({ error: { code: "unauthorized", message: "No valid session." } }, { status: 401 });
  }

  // Empty for super_admin: global scope is implied, not enumerated (FR-004).
  const scope = await getScopedStoreIds(session.user);
  const storeIds = scope === "all" ? [] : scope;

  return NextResponse.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      storeIds,
    },
  });
}
