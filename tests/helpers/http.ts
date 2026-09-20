import { NextRequest } from "next/server";

export function jsonRequest(
  url: string,
  opts: { method?: string; body?: unknown; cookie?: string; origin?: string | null } = {},
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.cookie) headers.cookie = opts.cookie;
  // Default to a same-origin request, as any legitimate browser fetch call would send.
  // Pass origin: null explicitly to simulate a cross-origin (CSRF) attempt.
  if (opts.origin !== null) headers.origin = opts.origin ?? "http://localhost:3000";

  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export function extractSessionCookie(response: Response): string | null {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/sm_session=([^;]+)/);
  return match ? `sm_session=${match[1]}` : null;
}

export async function loginAs(email: string, password: string): Promise<string> {
  const { POST: loginPOST } = await import("@/app/api/auth/login/route");
  const res = await loginPOST(jsonRequest("/api/auth/login", { method: "POST", body: { email, password } }));
  const cookie = extractSessionCookie(res);
  if (!cookie) throw new Error(`loginAs(${email}) failed: ${res.status}`);
  return cookie;
}
