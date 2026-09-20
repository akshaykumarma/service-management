import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getValidSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export default async function DashboardPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = await getValidSession(token);

  if (!session) {
    redirect("/login");
  }

  return (
    <main>
      <h1>Welcome, {session.user.name}</h1>
      <p>Role: {session.user.role}</p>
    </main>
  );
}
