import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userStores } from "@/lib/db/schema";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(token);

  if (!session) {
    return NextResponse.json({ error: { code: "unauthorized", message: "No valid session." } }, { status: 401 });
  }

  // Empty for super_admin: global scope is implied, not enumerated (FR-004).
  let storeIds: string[] = [];
  if (session.user.role !== "super_admin") {
    const rows = await db
      .select({ storeId: userStores.storeId })
      .from(userStores)
      .where(eq(userStores.userId, session.user.id));
    storeIds = rows.map((r) => r.storeId);
  }

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
