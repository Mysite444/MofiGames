"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, Flame, Sparkles, Medal, RefreshCw, Info, Mail, ShieldCheck,
  AlertTriangle, FileText, Baby, HeartHandshake, ChevronRight, LayoutGrid, User,
  Clock, Bookmark, Newspaper, Link2, Gamepad2,
} from "lucide-react";
import { mergeAllCategoriesWithDb } from "@/lib/categories";
import { iconMap } from "@/lib/icon-map";
import { useRealGames } from "@/lib/supabase/real-games-client";
import { FacebookIcon, InstagramIcon, XIcon, YoutubeIcon } from "./SocialIcons";

/** Custom pages (Admin → Content Management → Pages, "Show in menu" on)
 * and custom menu links (Admin → Site Settings → Menu Links) — both
 * fetched together from GET /api/fragments/navigation, which is backed
 * by the "navigation-menus" fragment (Admin → Cache → Fragment Cache)
 * rather than querying Supabase directly from the browser on every
 * NavList mount. Falls back to empty lists on a network hiccup, same as
 * before this was routed through the cache. */
function useNavigationFragment() {
  const [pages, setPages] = useState<{ slug: string; title: string }[]>([]);
  const [menuLinks, setMenuLinks] = useState<
    { id: string; label: string; url: string; open_in_new_tab: boolean }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/fragments/navigation")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.pages)) setPages(data.pages);
        if (Array.isArray(data.menuLinks)) setMenuLinks(data.menuLinks);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return { pages, menuLinks };
}

const discoverItems = [
  { label: "Home", href: "/", icon: Home },
  { label: "All Games", href: "/games", icon: Gamepad2 },
  { label: "Recently Played", href: "/recently-played", icon: Clock },
  { label: "Favorites", href: "/favorites", icon: Bookmark },
  { label: "Popular Games", href: "/popular-games", icon: Flame },
  { label: "Latest Games", href: "/latest-games", icon: Sparkles },
  { label: "Leaderboard", href: "/leaderboard", icon: Medal },
  { label: "Updated", href: "/updated-games", icon: RefreshCw },
  { label: "Categories", href: "/categories", icon: LayoutGrid },
];

const pageItems = [
  { label: "My Profile", href: "/profile", icon: User },
  { label: "Blog & News", href: "/blog", icon: Newspaper },
];

// Known content-page slugs keep their distinctive icon in the dynamic
// "Pages" list below; any other custom page created in
// Admin → Content Management → Pages falls back to the generic FileText
// icon. Keyed by slug rather than hardcoded here as separate items so a
// page's icon still applies even if an admin edits its title.
const PAGE_ICON_BY_SLUG: Record<string, typeof Info> = {
  about: Info,
  contact: Mail,
  "privacy-policy": ShieldCheck,
  disclaimer: AlertTriangle,
  terms: FileText,
  "kids-message": Baby,
  "parents-info": HeartHandshake,
};

const socialItems = [
  { label: "Facebook", href: "#", Icon: FacebookIcon },
  { label: "Instagram", href: "#", Icon: InstagramIcon },
  { label: "X", href: "#", Icon: XIcon },
  { label: "YouTube", href: "#", Icon: YoutubeIcon },
];

function SectionLabel({ collapsed, children }: { collapsed: boolean; children: string }) {
  if (collapsed) return null;
  return (
    <p className="px-3 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-wider text-text-faint first:pt-2">
      {children}
    </p>
  );
}

// Full white text always. Inactive items get the blue+yellow "lighting" hover
// (.menu-item, defined in globals.css); active route gets a steady yellow
// accent bar (.menu-item-active) instead of a hover effect.
const ITEM_BASE = "menu-item flex items-center gap-3 rounded-lg text-sm font-medium text-white";
const ITEM_EXPANDED_PAD = "px-3 py-2.5";
const ITEM_COLLAPSED_PAD = "justify-center px-1 py-2";

export function NavList({
  collapsed = false,
  showArrows = false,
  onNavigate,
}: {
  collapsed?: boolean;
  showArrows?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // NavList backs both the desktop sidebar and the mobile drawer (see
  // Sidebar.tsx / MobileDrawer.tsx) — both mounted sitewide, not just on
  // the homepage — so real categories come from the same site-wide
  // client-side cache used elsewhere (RealGamesSync in the root layout),
  // not page props. Without this, a category that only exists in the
  // database (no matching placeholder slug) had no menu entry anywhere.
  const { categories: realCategories } = useRealGames();
  // DB data wins for built-in categories (name, icon, colors, description,
  // SEO, etc.) so admin edits are reflected immediately in the nav.
  // Custom DB-only genres are appended after the 18 built-in ones.
  const genreItems = mergeAllCategoriesWithDb(realCategories);
  const { pages: navPages, menuLinks } = useNavigationFragment();

  return (
    <nav className={`flex flex-col ${collapsed ? "gap-0.5" : "gap-1"}`}>
      <SectionLabel collapsed={collapsed}>Discover</SectionLabel>
      {discoverItems.map((item) => {
        const Icon = item.icon;
        const active = item.href === "/" ? pathname === "/" : pathname === item.href;
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={`${ITEM_BASE} ${collapsed ? ITEM_COLLAPSED_PAD : ITEM_EXPANDED_PAD} ${
              active ? "menu-item-active" : ""
            }`}
          >
            <Icon
              size={21}
              strokeWidth={collapsed ? 2.75 : 2}
              className={collapsed ? "menu-icon-rail shrink-0" : "shrink-0"}
            />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}

      <SectionLabel collapsed={collapsed}>Genres</SectionLabel>
      {genreItems.map((cat) => {
        const Icon = iconMap[cat.icon];
        const href = `/${cat.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={cat.slug}
            href={href}
            onClick={onNavigate}
            title={collapsed ? cat.name : undefined}
            className={`${ITEM_BASE} ${collapsed ? ITEM_COLLAPSED_PAD : ITEM_EXPANDED_PAD} ${
              active ? "menu-item-active" : ""
            }`}
          >
            <Icon
              size={20}
              strokeWidth={collapsed ? 2.75 : 2}
              className={collapsed ? "menu-icon-rail shrink-0" : "shrink-0"}
            />
            {!collapsed && <span className="flex-1 truncate">{cat.name}</span>}
            {!collapsed && showArrows && (
              <ChevronRight size={16} strokeWidth={2.5} className="shrink-0 text-text-faint" />
            )}
          </Link>
        );
      })}

      {!collapsed && (
        <>
          <SectionLabel collapsed={collapsed}>Pages</SectionLabel>
          {pageItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                onClick={onNavigate}
                className={`${ITEM_BASE} ${ITEM_EXPANDED_PAD} ${active ? "menu-item-active" : ""}`}
              >
                <Icon size={18} strokeWidth={2} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          {navPages.map((page) => {
            const href = `/${page.slug}`;
            const active = pathname === href;
            const Icon = PAGE_ICON_BY_SLUG[page.slug] ?? FileText;
            return (
              <Link
                key={page.slug}
                href={href}
                onClick={onNavigate}
                className={`${ITEM_BASE} ${ITEM_EXPANDED_PAD} ${active ? "menu-item-active" : ""}`}
              >
                <Icon size={18} strokeWidth={2} />
                <span className="truncate">{page.title}</span>
              </Link>
            );
          })}

          {menuLinks.length > 0 && (
            <>
              <SectionLabel collapsed={collapsed}>Custom Links</SectionLabel>
              {menuLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  onClick={onNavigate}
                  target={link.open_in_new_tab ? "_blank" : undefined}
                  rel={link.open_in_new_tab ? "noreferrer" : undefined}
                  className={`${ITEM_BASE} ${ITEM_EXPANDED_PAD}`}
                >
                  <Link2 size={18} strokeWidth={2} />
                  <span className="truncate">{link.label}</span>
                </a>
              ))}
            </>
          )}

          <div className="mt-4 flex items-center gap-2 px-3">
            {socialItems.map(({ label, href, Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="menu-item flex h-9 w-9 items-center justify-center rounded-full text-white"
              >
                <Icon size={18} />
              </a>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
