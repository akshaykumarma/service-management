import { NextRequest, NextResponse } from "next/server";

/**
 * Origin-header verification (OWASP's recommended CSRF defense for cookie-authenticated,
 * same-origin apps): a legitimate same-origin fetch/XHR always carries an Origin (or,
 * failing that, a Referer) matching this app's own origin. A cross-site attacker's
 * browser-issued request carries its own origin instead — that mismatch is what this
 * rejects. Constitution Principle IV requires CSRF protection on every state-changing
 * endpoint; SameSite=Lax cookies alone are a mitigation, not this explicit check.
 *
 * Compares HOST only, not the full origin (scheme included) — deliberately, not an
 * oversight. This app always sits behind a TLS-terminating reverse proxy in any real
 * deployment (constitution: Nginx in production; a tunnel like ngrok for ad hoc remote
 * testing), which forwards the original Host header end-to-end but frequently does not
 * preserve the original scheme to the app's own Node process, which then sees a plain
 * `http://` connection despite the browser's Origin being `https://`. Requiring an exact
 * scheme match would make this check spuriously reject every same-site request through
 * such a proxy. The host (hostname+port) is still the thing that actually distinguishes
 * this app from an attacker's site, so comparing that alone preserves the real security
 * property.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === request.nextUrl.host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === request.nextUrl.host;
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
