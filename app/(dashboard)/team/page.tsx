import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import TeamPageClient from "./team-page-client";

export default async function TeamPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(token);

  if (!session) {
    redirect("/login");
  }
  // Store Service Managers and Technicians have no staff to manage; Admin and Super
  // Admin both land here, but see different slices — enforced server-side by
  // GET/POST /api/auth/users and the reset-password route, not just hidden client-side.
  if (session.user.role === "service_manager" || session.user.role === "technician") {
    redirect("/board");
  }

  return <TeamPageClient callerRole={session.user.role as "super_admin" | "admin"} />;
}
