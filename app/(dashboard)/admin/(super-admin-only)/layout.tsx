import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

// Machine models, Catalogue, and Templates stay Super-Admin-only (unlike Stores, which
// the parent admin/layout.tsx widened to Admin-or-above) — this route group's own extra
// gate, on top of the parent's baseline authenticated-session check.
export default async function SuperAdminOnlyLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(token);

  if (!session) {
    redirect("/login");
  }
  if (session.user.role !== "super_admin") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
