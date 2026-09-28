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

// Per-item accent dot color, matching the design's per-screen identity color.
const NAV_DOT: Record<string, string> = {
  board: "#a78bfa",
  reports: "#34d399",
  team: "#fbbf24",
  stores: "#f472b6",
  "machine-models": "#22d3ee",
  catalogue: "#a3e635",
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

  function NavLink({ href, label, dotKey }: { href: string; label: string; dotKey: string }) {
    return (
      <a href={href} className={navClass(href)}>
        <span className="app-sidebar__nav-icon" aria-hidden="true">
          <span className="app-sidebar__nav-dot" style={{ background: NAV_DOT[dotKey] }} />
        </span>
        {label}
      </a>
    );
  }

  const showAdminSection = role === "admin" || role === "super_admin";
  const showSuperAdminOnly = role === "super_admin";

  const navLinks = (
    <>
      <nav className="app-sidebar__nav" aria-label="Main">
        <NavLink href="/board" label="Board" dotKey="board" />
        {showAdminSection && <NavLink href="/reports" label="Reports" dotKey="reports" />}
      </nav>
      {showAdminSection && (
        <>
          <div className="app-sidebar__section-label">Admin</div>
          <nav className="app-sidebar__nav" aria-label="Admin">
            <NavLink href="/team" label="Team" dotKey="team" />
            <NavLink href="/admin/stores" label="Stores" dotKey="stores" />
            {showSuperAdminOnly && (
              <>
                <NavLink href="/admin/machine-models" label="Machine models" dotKey="machine-models" />
                <NavLink href="/admin/catalogue" label="Catalogue" dotKey="catalogue" />
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
          <span className="app-sidebar__brand-badge">
            <img src="/logo.png" alt="Shubha Sewing" />
          </span>
          <span className="app-sidebar__brand-tag">Service</span>
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
        <a href="/board" className="app-topbar__brand-badge">
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
