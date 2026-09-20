import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * Coarse, Edge-runtime-safe gate: redirects to /login when no session cookie is present
 * at all, for a fast UX bounce on obviously-unauthenticated requests. This is NOT where
 * FR-019's live authorization guarantee is enforced — the `pg` driver cannot run in the
 * Edge middleware runtime Next.js 14 provides, and a cookie's mere presence says nothing
 * about whether the session or the user behind it is still valid. Every protected route
 * handler and Server Component re-validates the session against the database itself
 * (`lib/auth/session.ts`'s `getValidSession`, plus `lib/auth/rbac.ts` for store/role
 * scope) on every request — that is the actual security boundary, not this middleware.
 */
export function middleware(request: NextRequest) {
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
