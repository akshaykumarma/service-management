import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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
