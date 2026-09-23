"use client";

import { useRouter, usePathname } from "next/navigation";

interface NavHeaderProps {
  name: string;
  role: "super_admin" | "admin" | "service_manager" | "technician";
}

const ROLE_LABELS: Record<NavHeaderProps["role"], string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  service_manager: "Store Service Manager",
  technician: "Technician",
};

export default function NavHeader({ name, role }: NavHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  function navClass(href: string) {
    const active = pathname === href || (href !== "/board" && pathname?.startsWith(href));
    return active ? "active" : undefined;
  }

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
        <a href="/board" className={navClass("/board")}>
          Board
        </a>
        <a href="/tickets/new" className={navClass("/tickets/new")}>
          New ticket
        </a>
        {(role === "admin" || role === "super_admin") && (
          <a href="/reports" className={navClass("/reports")}>
            Reports
          </a>
        )}
        {(role === "admin" || role === "super_admin") && (
          <a href="/team" className={navClass("/team")}>
            Team
          </a>
        )}
        {role === "super_admin" && (
          <>
            <a href="/admin/stores" className={navClass("/admin/stores")}>
              Stores
            </a>
            <a href="/admin/machine-models" className={navClass("/admin/machine-models")}>
              Machine models
            </a>
            <a href="/admin/catalogue" className={navClass("/admin/catalogue")}>
              Catalogue
            </a>
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
