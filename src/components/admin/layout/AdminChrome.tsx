"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Menu, X, Search, Bell, LogOut, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/Avatar";
import { AdminIcon } from "./adminNavIcons";
import type { AdminNavGroup, AdminNavLink } from "./adminNavConfig";

const COLLAPSE_KEY = "admin-sidebar-collapsed";

function NavRow({
  link,
  active,
  collapsed,
  onNavigate,
}: {
  link: AdminNavLink;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      title={collapsed ? link.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
        link.sub ? "pl-9 pr-3" : "px-3"
      } ${collapsed ? "justify-center px-0" : ""} ${
        active
          ? "bg-white/10 text-white"
          : link.sub
            ? "text-white/60 hover:bg-white/10 hover:text-white"
            : "text-white/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      {active && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-white" />}
      <AdminIcon name={link.icon} size={link.sub ? 15 : 17} />
      {!collapsed && <span className="truncate">{link.label}</span>}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-[#18181c] px-2 py-1 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10 group-hover:block z-50">
          {link.label}
        </span>
      )}
    </Link>
  );
}

function SidebarContent({
  topLinks,
  groups,
  pathname,
  collapsed,
  onNavigate,
}: {
  topLinks: AdminNavLink[];
  groups: AdminNavGroup[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <Link
        href="/"
        onClick={onNavigate}
        title={collapsed ? "Back to site" : undefined}
        className={`mb-4 flex items-center gap-2 text-xs font-semibold text-text-faint hover:text-white ${
          collapsed ? "justify-center" : ""
        }`}
      >
        <ArrowLeft size={14} />
        {!collapsed && "Back to site"}
      </Link>

      {!collapsed && (
        <span className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-text-faint">Admin panel</span>
      )}

      {topLinks.map((link) => (
        <NavRow key={link.href} link={link} active={pathname === link.href} collapsed={collapsed} onNavigate={onNavigate} />
      ))}

      {groups.map((group) => (
        <div key={group.id} className="mt-1">
          {!collapsed ? (
            <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
              {group.label}
            </span>
          ) : (
            <div className="mx-2 mt-3 mb-1 border-t border-white/10" />
          )}
          {group.links.map((link) => (
            <div key={link.href}>
              {!collapsed && link.dividerBefore && (
                <span className="mb-0.5 mt-2 block px-3 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  {link.dividerBefore}
                </span>
              )}
              <NavRow
                link={link}
                active={pathname === link.href}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function AdminChrome({
  topLinks,
  groups,
  roleLabel,
  pendingReportsCount,
  children,
}: {
  topLinks: AdminNavLink[];
  groups: AdminNavGroup[];
  roleLabel: string;
  pendingReportsCount: number | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const allLinks = useMemo(() => {
    const flat: AdminNavLink[] = [...topLinks];
    for (const g of groups) flat.push(...g.links);
    return flat;
  }, [topLinks, groups]);

  const currentTitle = useMemo(() => {
    const exact = allLinks.find((l) => l.href === pathname);
    if (exact) return exact.label;
    // Fall back to the deepest matching link prefix (e.g. edit/detail sub-routes).
    const prefix = allLinks
      .filter((l) => pathname.startsWith(l.href) && l.href !== "/admin")
      .sort((a, b) => b.href.length - a.href.length)[0];
    if (prefix) return prefix.label;
    if (pathname === "/admin") return "Dashboard";
    return "Admin";
  }, [allLinks, pathname]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allLinks.filter((l) => l.label.toLowerCase().includes(q)).slice(0, 8);
  }, [allLinks, query]);

  function jumpTo(href: string) {
    setQuery("");
    router.push(href);
  }

  return (
    <div className="admin-shell flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={`glass sticky top-0 hidden h-screen shrink-0 flex-col gap-1 border-r border-[var(--color-surface-border)] bg-[var(--color-menu-bg)] p-4 transition-[width] duration-150 md:flex ${
          collapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <SidebarContent topLinks={topLinks} groups={groups} pathname={pathname} collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="mt-2 flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <ChevronRight size={15} /> : (
            <>
              <ChevronLeft size={15} /> Collapse
            </>
          )}
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <div className="glass relative flex h-full w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto bg-[var(--color-menu-bg)] p-4">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
            >
              <X size={18} className="text-white/70" />
            </button>
            <SidebarContent
              topLinks={topLinks}
              groups={groups}
              pathname={pathname}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="glass sticky top-0 z-40 flex shrink-0 items-center gap-3 border-b border-[var(--color-surface-border)] px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 md:hidden"
          >
            <Menu size={19} className="text-white/80" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-bold text-white sm:text-lg">{currentTitle}</h1>
          </div>

          {/* Quick-jump search */}
          <div className="relative hidden sm:block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchResults[0]) jumpTo(searchResults[0].href);
                if (e.key === "Escape") setQuery("");
              }}
              placeholder="Jump to…"
              aria-label="Search admin sections"
              className="admin-input w-44 py-1.5 pl-8 text-xs lg:w-60"
            />
            {searchResults.length > 0 && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-white/10 bg-[#18181c] py-1 shadow-xl">
                {searchResults.map((r) => (
                  <button
                    key={r.href}
                    type="button"
                    onClick={() => jumpTo(r.href)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    <AdminIcon name={r.icon} size={14} />
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications: real pending-reports count, no fabricated data */}
          {pendingReportsCount !== null && (
            <Link
              href="/admin/reports"
              aria-label={`${pendingReportsCount} pending reports`}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-white/10"
            >
              <Bell size={17} className="text-white/80" />
              {pendingReportsCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-hot px-1 text-[10px] font-bold text-white">
                  {pendingReportsCount > 99 ? "99+" : pendingReportsCount}
                </span>
              )}
            </Link>
          )}

          {/* User menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-white/10"
            >
              <Avatar name={user?.name ?? "Admin"} size={30} />
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-xs font-semibold text-white">{user?.name ?? "Admin"}</span>
                <span className="block text-[10px] text-text-faint">{roleLabel}</span>
              </span>
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-lg border border-white/10 bg-[#18181c] py-1 shadow-xl">
                  <div className="border-b border-white/10 px-3 py-2">
                    <p className="truncate text-xs font-semibold text-white">{user?.name}</p>
                    <p className="truncate text-[11px] text-text-faint">{user?.email}</p>
                  </div>
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <ExternalLink size={14} />
                    Back to site
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-hot hover:bg-hot/10"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
