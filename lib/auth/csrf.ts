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
  // The raw incoming Host header is the most authoritative source for "what host was
  // this request addressed to" — it's exactly what a reverse proxy (ngrok, Nginx) must
  // forward correctly for name-based routing to work at all, unlike request.nextUrl,
  // which is Next.js's own derived value and a synthetic NextRequest in tests never sets
  // a Host header, so fall back to nextUrl.host there.
  const expectedHost = request.headers.get("host") ?? request.nextUrl.host;

  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const candidate = origin ?? referer;

  if (!candidate) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[csrf] rejected: no Origin or Referer header present", {
        expectedHost,
        path: request.nextUrl.pathname,
      });
    }
    return false;
  }

  try {
    const candidateHost = new URL(candidate).host;
    const same = candidateHost === expectedHost;
    if (!same && process.env.NODE_ENV !== "production") {
      console.warn("[csrf] rejected: host mismatch", {
        expectedHost,
        candidateHost,
        origin,
        referer,
        path: request.nextUrl.pathname,
      });
    }
    return same;
  } catch {
    return false;
  }
}

export function requireSameOrigin(request: NextRequest): NextResponse | null {
  if (isSameOrigin(request)) return null;
  return NextResponse.json(
    { error: { code: "csrf_check_failed", message: "Cross-origin request blocked." } },
    { status: 403 },
  );
}
