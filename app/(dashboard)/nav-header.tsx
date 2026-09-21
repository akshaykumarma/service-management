"use client";

import { useRouter } from "next/navigation";

interface NavHeaderProps {
  name: string;
  role: "super_admin" | "admin" | "service_manager";
}

const ROLE_LABELS: Record<NavHeaderProps["role"], string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  service_manager: "Store Service Manager",
};

export default function NavHeader({ name, role }: NavHeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="app-header">
      <a href="/board" className="app-header__brand">
        <img src="/logo.png" alt="Shubha Sewing" />
      </a>
      <nav className="app-header__nav" aria-label="Main">
        <a href="/board">Board</a>
        <a href="/tickets/new">New ticket</a>
        {(role === "admin" || role === "super_admin") && <a href="/reports">Reports</a>}
        {(role === "admin" || role === "super_admin") && <a href="/team">Team</a>}
        {role === "super_admin" && (
          <>
            <a href="/admin/stores">Stores</a>
            <a href="/admin/machine-models">Machine models</a>
            <a href="/admin/catalogue">Catalogue</a>
          </>
        )}
      </nav>
      <div className="app-header__user">
        <span>
          {name} · {ROLE_LABELS[role]}
        </span>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
