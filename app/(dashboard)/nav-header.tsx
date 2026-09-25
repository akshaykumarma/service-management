"use client";

import { useEffect, useState } from "react";
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

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function NavHeader({ name, role }: NavHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Collapse the mobile menu automatically whenever navigation happens, so it
  // never stays open pointing at a page the user has already left.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function navClass(href: string) {
    const active = pathname === href || (href !== "/board" && pathname?.startsWith(href));
    return active ? "active" : undefined;
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const showAdminSection = role === "admin" || role === "super_admin";
  const showSuperAdminOnly = role === "super_admin";

  const navLinks = (
    <>
      <nav className="app-sidebar__nav" aria-label="Main">
        <a href="/board" className={navClass("/board")}>
          Board
        </a>
        {showAdminSection && (
          <a href="/reports" className={navClass("/reports")}>
            Reports
          </a>
        )}
        {showAdminSection && (
          <a href="/team" className={navClass("/team")}>
            Team
          </a>
        )}
      </nav>
      {showAdminSection && (
        <>
          <div className="app-sidebar__section-label">Admin</div>
          <nav className="app-sidebar__nav" aria-label="Admin">
            <a href="/admin/stores" className={navClass("/admin/stores")}>
              Stores
            </a>
            {showSuperAdminOnly && (
              <>
                <a href="/admin/machine-models" className={navClass("/admin/machine-models")}>
                  Machine models
                </a>
                <a href="/admin/catalogue" className={navClass("/admin/catalogue")}>
                  Catalogue
                </a>
              </>
            )}
          </nav>
        </>
      )}
    </>
  );

  const userBlock = (
    <div className="app-sidebar__user">
      <span className="app-sidebar__avatar" aria-hidden="true">
        {initials(name)}
      </span>
      <div className="app-sidebar__who">
        <div className="app-sidebar__name">{name}</div>
        <div className="app-sidebar__role">{ROLE_LABELS[role]}</div>
      </div>
      <button type="button" className="app-sidebar__logout" title="Log out" onClick={handleLogout}>
        Log out
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop: a fixed left sidebar (>860px, see globals.css). */}
      <aside className="app-sidebar">
        <a href="/board" className="app-sidebar__brand">
          <img src="/logo.png" alt="Shubha Sewing" />
        </a>
        <div className="app-sidebar__new">
          <button type="button" className="app-sidebar__new-btn" onClick={() => router.push("/tickets/new")}>
            <span aria-hidden="true">+</span> New ticket
          </button>
        </div>
        {navLinks}
        {userBlock}
      </aside>

      {/* Mobile/tablet: a sticky top bar whose hamburger opens the same nav as a dropdown. */}
      <div className="app-topbar">
        <a href="/board">
          <img src="/logo.png" alt="Shubha Sewing" />
        </a>
        <div className="app-topbar__spacer" />
        <button
          type="button"
          className="app-header__menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="app-header-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
        </button>
        <div id="app-header-menu" className={`app-topbar__menu${menuOpen ? " app-topbar__menu--open" : ""}`}>
          <div className="app-sidebar__new">
            <button type="button" className="app-sidebar__new-btn" onClick={() => router.push("/tickets/new")}>
              <span aria-hidden="true">+</span> New ticket
            </button>
          </div>
          {navLinks}
          {userBlock}
        </div>
      </div>
    </>
  );
}
