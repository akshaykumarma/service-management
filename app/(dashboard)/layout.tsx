import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import NavHeader from "./nav-header";

export default async function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(token);

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="app-shell">
      <NavHeader name={session.user.name} role={session.user.role} />
      {children}
    </div>
  );
}
