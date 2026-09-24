import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(token);

  if (!session) {
    redirect("/login");
  }
  // Widened from Super-Admin-only to Admin-or-above (per direct product feedback):
  // Stores' own edit capability follows this gate. Machine models/Catalogue/Templates
  // stay Super-Admin-only via the nested (super-admin-only) route group's own layout.
  if (session.user.role !== "super_admin" && session.user.role !== "admin") {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
