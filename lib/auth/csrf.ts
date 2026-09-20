import { NextRequest, NextResponse } from "next/server";

/**
 * Origin-header verification (OWASP's recommended CSRF defense for cookie-authenticated,
 * same-origin apps): a legitimate same-origin fetch/XHR always carries an Origin (or,
 * failing that, a Referer) matching this app's own origin. A cross-site attacker's
 * browser-issued request carries its own origin instead — that mismatch is what this
 * rejects. Constitution Principle IV requires CSRF protection on every state-changing
 * endpoint; SameSite=Lax cookies alone are a mitigation, not this explicit check.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origin === request.nextUrl.origin;

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === request.nextUrl.origin;
    } catch {
      return false;
    }
  }

  return false;
}

export function requireSameOrigin(request: NextRequest): NextResponse | null {
  if (isSameOrigin(request)) return null;
  return NextResponse.json(
    { error: { code: "csrf_check_failed", message: "Cross-origin request blocked." } },
    { status: 403 },
  );
}
