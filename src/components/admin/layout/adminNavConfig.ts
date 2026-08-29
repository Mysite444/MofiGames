/**
 * Single source of truth for the admin sidebar.
 *
 * This replaces the ~700 lines of hardcoded <Link> JSX that used to live in
 * admin/layout.tsx. Every route, label, and icon that existed before is
 * still here — nothing was dropped — just reorganized into the 12-section
 * order requested for the redesign, and expressed as data so AdminSidebar /
 * AdminMobileNav can both render it (and so a new section can be added by
 * editing this file instead of the layout).
 *
 * Visibility is computed here, server-side, from the same permission
 * booleans admin/layout.tsx always computed (has_permission() RPC results +
 * isAdmin/isStaff) — so the permission MODEL is unchanged, only where the
 * resulting nav tree gets assembled.
 */

export interface AdminNavPerms {
  isAdmin: boolean;
  isStaff: boolean;
  canBan: boolean;
  canVerify: boolean;
  canManageReports: boolean;
  canViewActivity: boolean;
  canModerateComments: boolean;
  canManageCopyright: boolean;
}

export interface AdminNavLink {
  href: string;
  label: string;
  /** Key into the icon map in AdminSidebar/AdminMobileNav. */
  icon: string;
  /** Sub-item — rendered smaller/indented, same as the old pl-9 rows. */
  sub?: boolean;
  /** A short label rendered above this link as a subgroup divider (e.g. "User Reports"). */
  dividerBefore?: string;
}

export interface AdminNavGroup {
  id: string;
  label: string;
  links: AdminNavLink[];
}

/** Top-level links rendered above every section (not inside a labeled group). */
export function buildTopLinks(perms: AdminNavPerms): AdminNavLink[] {
  const links: AdminNavLink[] = [];
  if (perms.isAdmin) {
    links.push({ href: "/admin", label: "Dashboard", icon: "layoutDashboard" });
  }
  return links;
}

export function buildAdminNav(perms: AdminNavPerms): AdminNavGroup[] {
  const groups: AdminNavGroup[] = [];

  // 1. Content Management ---------------------------------------------------
  if (perms.isAdmin) {
    groups.push({
      id: "content",
      label: "Content Management",
      links: [
        { href: "/admin/games", label: "Games", icon: "gamepad2" },
        { href: "/admin/homepage", label: "Featured Content", icon: "home" },
        { href: "/admin/categories", label: "Categories", icon: "layoutGrid" },
        { href: "/admin/tags", label: "Tags", icon: "tag" },
        { href: "/admin/pages", label: "Pages", icon: "fileText" },
        { href: "/admin/posts", label: "Blog / News", icon: "newspaper" },
        { href: "/admin/comments", label: "Comments", icon: "messageSquare" },
        { href: "/admin/reviews", label: "Reviews", icon: "star" },
      ],
    });
  }

  // 2. Media Management ------------------------------------------------------
  if (perms.isAdmin) {
    groups.push({
      id: "media",
      label: "Media Management",
      links: [
        { href: "/admin/media/images", label: "Images", icon: "image" },
        { href: "/admin/media/thumbnails", label: "Thumbnails", icon: "galleryHorizontal" },
        { href: "/admin/media/icons", label: "Icons", icon: "shapes" },
        { href: "/admin/media/videos", label: "Videos", icon: "video" },
        { href: "/admin/media/gifs", label: "GIFs", icon: "film" },
      ],
    });
  }

  // 3. Cache -------------------------------------------------------------
  if (perms.isAdmin) {
    groups.push({
      id: "cache",
      label: "Cache",
      links: [
        { href: "/admin/cache", label: "Overview", icon: "database" },
        { href: "/admin/cache/monitoring", label: "Cache Monitoring", icon: "gauge" },
        { href: "/admin/cache/browser", label: "Browser Cache", icon: "gauge" },
        { href: "/admin/cache/cdn", label: "CDN / Edge Cache", icon: "globe" },
        { href: "/admin/cache/php-opcode", label: "PHP OPcache", icon: "cpu" },
        { href: "/admin/cache/object", label: "Object Cache", icon: "layers3" },
        { href: "/admin/cache/fragment", label: "Fragment Cache", icon: "layers3" },
        { href: "/admin/cache/full-page", label: "Full-Page Cache", icon: "fileCode" },
        { href: "/admin/cache/static-assets", label: "Static Asset Cache", icon: "fileCode" },
        { href: "/admin/cache/image", label: "Image Cache", icon: "image" },
        { href: "/admin/cache/dns", label: "DNS Cache", icon: "network" },
        { href: "/admin/cache/edge", label: "Edge Cache", icon: "zap" },
        { href: "/admin/cache/session", label: "Session Cache", icon: "lock" },
        { href: "/admin/cache/search", label: "Search Cache", icon: "search" },
        { href: "/admin/cache/metadata", label: "Metadata Cache", icon: "braces" },
        { href: "/admin/cache/feed", label: "Feed Cache", icon: "rss" },
        { href: "/admin/cache/media", label: "Media Cache", icon: "film" },
        { href: "/admin/cache/db-optimization", label: "Database / Query Cache", icon: "database" },
        { href: "/admin/cache/analytics", label: "Analytics Cache", icon: "barChart3" },
        { href: "/admin/cache/api-cache", label: "API / Data Cache", icon: "braces" },
        { href: "/admin/cache/preloading", label: "Preloading & Prefetching", icon: "rocket" },
        { href: "/admin/cache/smart", label: "Smart Cache", icon: "brainCircuit" },
        { href: "/admin/cache/compression", label: "Compression", icon: "minimize2" },
        { href: "/admin/cache/security", label: "Security", icon: "fingerprint" },
      ],
    });
  }

  // 4. Analytics & SEO (monitoring — distinct from SEO Management/config) ---
  if (perms.isAdmin) {
    groups.push({
      id: "analytics",
      label: "Analytics & SEO",
      links: [
        { href: "/admin/analytics", label: "Overview", icon: "activity" },
        { href: "/admin/analytics/games", label: "Games & Categories", icon: "trendingUp" },
        { href: "/admin/analytics/users", label: "Users & Search", icon: "users" },
        { href: "/admin/analytics/content-health", label: "Content Health", icon: "heartPulse" },
        { href: "/admin/seo/analysis", label: "SEO Analysis", icon: "barChart3" },
        { href: "/admin/analytics/integrations", label: "Connect Integrations", icon: "plug" },
      ],
    });
  }

  // 5. User Security (was "Security") ---------------------------------------
  if (perms.isAdmin) {
    groups.push({
      id: "user-security",
      label: "User Security",
      links: [
        { href: "/admin/security", label: "Settings", icon: "shieldCheck" },
        { href: "/admin/security/access", label: "Access Control", icon: "ban" },
        { href: "/admin/security/api-keys", label: "API Keys", icon: "keyRound" },
        { href: "/admin/security/backups", label: "Backups", icon: "hardDriveDownload" },
        { href: "/admin/backup", label: "Backup & Migration", icon: "database" },
        { href: "/admin/security/logs", label: "Login Logs", icon: "scrollText" },
        { href: "/admin/security/action-log", label: "Action Log", icon: "clipboardList" },
        { href: "/admin/security/alerts", label: "Alerts", icon: "shieldAlert" },
        { href: "/admin/security/maintenance", label: "Maintenance", icon: "wrench" },
      ],
    });
  }

  // 6. Monetization -----------------------------------------------------
  if (perms.isAdmin) {
    groups.push({
      id: "monetization",
      label: "Monetization",
      links: [
        { href: "/admin/ads", label: "Advertisement Management", icon: "megaphone" },
        { href: "/admin/ads/protection", label: "Ad Protection", icon: "shieldCheck" },
        { href: "/admin/ads/protection/dashboard", label: "Traffic Quality Dashboard", icon: "barChart3", sub: true },
        { href: "/admin/ads/protection/reports", label: "Invalid Traffic Reports", icon: "fileWarning", sub: true },
        { href: "/admin/ads/protection/rules", label: "Whitelist / Blacklist", icon: "ban", sub: true },
        { href: "/admin/ads/protection/heatmap", label: "Click Heatmap", icon: "grid3x3", sub: true },
        { href: "/admin/ads/protection/placement", label: "Ad Placement Validation", icon: "clipboardCheck", sub: true },
      ],
    });
  }

  // 7. SEO Management (configuration — distinct from Analytics & SEO) -------
  if (perms.isAdmin) {
    groups.push({
      id: "seo",
      label: "SEO Management",
      links: [
        { href: "/admin/seo", label: "Global Settings", icon: "search" },
        { href: "/admin/seo/sitemaps", label: "Sitemaps", icon: "map" },
        { href: "/admin/seo/robots", label: "Robots.txt", icon: "scrollText" },
        { href: "/admin/seo/redirects", label: "Redirects", icon: "link2" },
        { href: "/admin/seo/structured-data", label: "Structured Data", icon: "braces" },
      ],
    });
  }

  // 8. Automation -------------------------------------------------------
  if (perms.isAdmin) {
    groups.push({
      id: "automation",
      label: "Automation",
      links: [
        { href: "/admin/automation", label: "Jobs & Schedules", icon: "zap" },
        { href: "/admin/automation/imports", label: "Import Manager", icon: "gamepad2" },
        { href: "/admin/automation/logs", label: "Job Logs", icon: "listChecks" },
      ],
    });
  }

  // 9. Localization -------------------------------------------------------
  if (perms.isAdmin) {
    groups.push({
      id: "localization",
      label: "Localization",
      links: [
        { href: "/admin/localization/languages", label: "Languages", icon: "languages" },
        { href: "/admin/localization/currencies", label: "Currency", icon: "coins" },
        { href: "/admin/localization/translations", label: "Translations", icon: "type" },
        { href: "/admin/localization/region", label: "Region Settings", icon: "mapPin" },
        { href: "/admin/localization/advanced", label: "Advanced", icon: "sliders" },
      ],
    });
  }

  // 10. User Management -----------------------------------------------------
  if (perms.isStaff) {
    const links: AdminNavLink[] = [{ href: "/admin/users", label: "Users", icon: "users" }];
    if (perms.isAdmin) links.push({ href: "/admin/users/roles", label: "Roles & Permissions", icon: "shieldQuestion" });
    if (perms.canBan) links.push({ href: "/admin/users/banned", label: "Banned Users", icon: "ban" });
    if (perms.canVerify) links.push({ href: "/admin/users/verification", label: "User Verification", icon: "badgeCheck" });
    if (perms.isAdmin) links.push({ href: "/admin/users/sessions", label: "Login & Sessions", icon: "keyRound" });
    if (perms.canViewActivity) links.push({ href: "/admin/users/activity", label: "Activity Logs", icon: "history" });
    groups.push({ id: "user-management", label: "User Management", links });
  }

  // 11. Report & Moderation --------------------------------------------------
  if (perms.isStaff) {
    const links: AdminNavLink[] = [];

    // Non-admin moderators without a full Content Management view still need
    // a way to moderate comments/reviews — this mirrors the old "Moderation"
    // fallback block exactly, just filed under Report & Moderation instead
    // of its own top-level section.
    if (!perms.isAdmin && perms.canModerateComments) {
      links.push({ href: "/admin/comments", label: "Comment Moderation", icon: "messageSquare" });
      links.push({ href: "/admin/reviews", label: "Review Moderation", icon: "star" });
    }

    if (perms.canManageReports || perms.canManageCopyright) {
      links.push({ href: "/admin/reports", label: "Report Queue", icon: "inbox" });
      links.push({ href: "/admin/reports/history", label: "Report History", icon: "archive" });
      links.push({ href: "/admin/reports/categories", label: "Report Categories", icon: "folderKanban" });

      if (perms.canManageReports) {
        links.push({ href: "/admin/reports/user", label: "User Reports", icon: "flag", dividerBefore: "User Reports" });
        links.push({ href: "/admin/reports/abuse", label: "Abuse Reports", icon: "shieldAlert", dividerBefore: "Abuse & Moderation" });
        links.push({ href: "/admin/reports/spam", label: "Spam Reports", icon: "mailWarning" });
        links.push({ href: "/admin/reports/harassment", label: "Harassment / Hate Speech", icon: "messagesSquare" });
        links.push({ href: "/admin/reports/impersonation", label: "Impersonation", icon: "userX" });
        links.push({ href: "/admin/reports/inappropriate", label: "Inappropriate Content", icon: "alertTriangle" });
      }

      if (perms.canManageCopyright) {
        links.push({ href: "/admin/reports/copyright", label: "Copyright Requests", icon: "copyright", dividerBefore: "Copyright" });
        links.push({ href: "/admin/reports/dmca", label: "DMCA Requests", icon: "gavel" });
        links.push({ href: "/admin/reports/counter-notices", label: "Counter-Notices", icon: "undo2" });
        links.push({ href: "/admin/reports/copyright-history", label: "Copyright Claim History", icon: "scale" });
      }

      links.push({ href: "/admin/reports/audit-log", label: "Audit Log", icon: "listChecks", dividerBefore: "Administration" });
    }

    if (links.length > 0) {
      groups.push({ id: "reports", label: "Report & Moderation", links });
    }
  }

  // 12. Site Identity (was "Site Settings") ----------------------------------
  if (perms.isAdmin) {
    groups.push({
      id: "site-identity",
      label: "Site Identity",
      links: [
        { href: "/admin/settings/identity", label: "Site Identity", icon: "palette" },
        { href: "/admin/settings/menu", label: "Menu Links", icon: "listTree" },
      ],
    });
  }

  return groups;
}
