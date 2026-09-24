import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import StoresPageClient from "./stores-page-client";

export default async function StoresPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(token);

  if (!session) {
    redirect("/login");
  }
  // The parent admin/layout.tsx already redirects anyone below Admin; this is just
  // narrowing the type for the client component's callerRole prop.
  if (session.user.role !== "super_admin" && session.user.role !== "admin") {
    redirect("/dashboard");
  }

  return <StoresPageClient callerRole={session.user.role} />;
}
