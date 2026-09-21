import { redirect } from "next/navigation";

// The (dashboard) group layout already establishes the session (redirecting to /login
// if absent), so this route's only job is picking a landing page — the board, since
// that's the actual day-to-day view (Jira-style status columns), not a bare welcome page.
export default function DashboardPage() {
  redirect("/board");
}
