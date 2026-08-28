import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LayoutGrid,
  Gamepad2,
  MessageSquare,
  ArrowLeft,
  Home,
  Tag,
  FileText,
  Newspaper,
  Image as ImageIcon,
  GalleryHorizontal,
  Shapes,
  Video,
  Film,
  Search,
  Map,
  ScrollText,
  ClipboardList,
  Link2,
  Braces,
  Rss,
  BarChart3,
  Activity,
  TrendingUp,
  Users,
  HeartPulse,
  Plug,
  ShieldQuestion,
  ShieldCheck,
  HardDriveDownload,
  Ban,
  Flag,
  BadgeCheck,
  KeyRound,
  History,
  Languages,
  Coins,
  Type,
  MapPin,
  Sliders,
  Inbox,
  Archive,
  FolderKanban,
  ShieldAlert,
  MailWarning,
  MessagesSquare,
  UserX,
  AlertTriangle,
  Copyright,
  Gavel,
  Undo2,
  Scale,
  ListChecks,
  Zap,
  Wrench,
  Palette,
  ListTree,
  Megaphone,
  FileWarning,
  Grid3x3,
  ClipboardCheck,
  Database,
  Gauge,
  Globe,
  Cpu,
  Layers3,
  FileCode,
  Network,
  Lock,
  Rocket,
  BrainCircuit,
  Minimize2,
  Fingerprint,
  Star,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSecuritySettingsServer } from "@/lib/security-server";

export const metadata: Metadata = {
  title: "Admin — MofiGames",
  robots: { index: false, follow: false },
};

/**
 * Guards every /admin/* route. Checked here on the server (not just via a
 * client-side redirect) so the admin UI never even renders for a
 * non-admin — RLS on the games/categories tables backs this up regardless,
 * but this avoids the flash-of-protected-content problem entirely.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.is_admin ? "admin" : profile?.role ?? "user";
  const isAdmin = role === "admin";
  const isStaff = isAdmin || role === "editor" || role === "moderator";

  if (!isStaff) {
    redirect("/");
  }

  // If "Require 2FA for admins" is enabled in Admin → Security → Settings,
  // enforce it here: an admin whose session hasn't been elevated to aal2
  // (either because they haven't enrolled a TOTP factor yet, or because
  // the login flow somehow didn't challenge them) is redirected to their
  // profile security page with a prompt to set up 2FA before continuing.
  // Fails soft — a broken settings lookup or MFA status call never blocks
  // the admin panel entirely, it just skips the check.
  if (isAdmin) {
    try {
      const [secSettings, aal] = await Promise.all([
        getSecuritySettingsServer(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      if (
        secSettings.require2faForAdmins &&
        aal.data?.currentLevel !== "aal2"
      ) {
        // The login flow (auth-context.tsx) already handles the case where
        // MFA is enrolled but the challenge hasn't been completed — the user
        // sees the TOTP prompt before entering the app.  The case we catch
        // here is: require_2fa_for_admins is ON but the admin has never
        // enrolled a factor at all.  Send them to set it up.
        redirect("/profile?require_2fa=1");
      }
    } catch {
      // Fail soft — never let a broken MFA check lock an admin out.
    }
  }

  // Which User Management sub-screens this viewer can act on — computed
  // once here via the same has_permission() RPC everything else uses, so
  // the sidebar never shows a link to a screen that would just 403. Admin
  // sees everything; other sections (Content Management, SEO, Analytics)
  // stay admin-only until their routes are retrofitted with the same
  // permission model.
  const [canBan, canVerify, canManageReports, canViewActivity, canModerateComments, canManageCopyright] = isAdmin
    ? [true, true, true, true, true, true]
    : await Promise.all(
        (
          ["ban_users", "verify_users", "manage_reports", "view_activity_logs", "moderate_comments", "manage_copyright"] as const
        ).map((perm) => supabase.rpc("has_permission", { perm }).then(({ data }) => Boolean(data)))
      );

  return (
    <div className="flex min-h-screen bg-[var(--color-menu-bg)]">
      <aside className="glass sticky top-0 flex h-screen w-56 shrink-0 flex-col gap-1 border-r border-[var(--color-surface-border)] p-4">
        <Link
          href="/"
          className="mb-4 flex items-center gap-2 text-xs font-semibold text-text-faint hover:text-white"
        >
          <ArrowLeft size={14} />
          Back to site
        </Link>
        <span className="mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-text-faint">
          Admin panel
        </span>
        {isAdmin && (
          <>
        <Link
          href="/admin/homepage"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Home size={17} />
          Homepage
        </Link>

        <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
          Site Settings
        </span>
        <Link
          href="/admin/settings/identity"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Palette size={17} />
          Site Identity
        </Link>
        <Link
          href="/admin/settings/menu"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ListTree size={17} />
          Menu Links
        </Link>

        <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
          Monetization
        </span>
        <Link
          href="/admin/ads"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Megaphone size={17} />
          Advertisement Management
        </Link>
        <Link
          href="/admin/ads/protection"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ShieldCheck size={17} />
          Ad Protection
        </Link>
        <Link
          href="/admin/ads/protection/dashboard"
          className="flex items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <BarChart3 size={15} />
          Traffic Quality Dashboard
        </Link>
        <Link
          href="/admin/ads/protection/reports"
          className="flex items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <FileWarning size={15} />
          Invalid Traffic Reports
        </Link>
        <Link
          href="/admin/ads/protection/rules"
          className="flex items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Ban size={15} />
          Whitelist / Blacklist
        </Link>
        <Link
          href="/admin/ads/protection/heatmap"
          className="flex items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Grid3x3 size={15} />
          Click Heatmap
        </Link>
        <Link
          href="/admin/ads/protection/placement"
          className="flex items-center gap-2.5 rounded-lg py-2 pl-9 pr-3 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ClipboardCheck size={15} />
          Ad Placement Validation
        </Link>

        <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
          Content Management
        </span>
        <Link
          href="/admin/games"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Gamepad2 size={17} />
          Games
        </Link>
        <Link
          href="/admin/categories"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LayoutGrid size={17} />
          Categories
        </Link>
        <Link
          href="/admin/comments"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <MessageSquare size={17} />
          Comments
        </Link>
        <Link
          href="/admin/reviews"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Star size={17} />
          Reviews
        </Link>
        <Link
          href="/admin/tags"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Tag size={17} />
          Tags
        </Link>
        <Link
          href="/admin/pages"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <FileText size={17} />
          Pages
        </Link>
        <Link
          href="/admin/posts"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Newspaper size={17} />
          Blog / News
        </Link>

        <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
          Automation
        </span>
        <Link
          href="/admin/automation"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Zap size={17} />
          Jobs &amp; Schedules
        </Link>
        <Link
          href="/admin/automation/imports"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Gamepad2 size={17} />
          Import Manager
        </Link>
        <Link
          href="/admin/automation/logs"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ListChecks size={17} />
          Job Logs
        </Link>

        <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
          Media Management
        </span>
        <Link
          href="/admin/media/images"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ImageIcon size={17} />
          Images
        </Link>
        <Link
          href="/admin/media/thumbnails"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <GalleryHorizontal size={17} />
          Thumbnails
        </Link>
        <Link
          href="/admin/media/icons"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Shapes size={17} />
          Icons
        </Link>
        <Link
          href="/admin/media/videos"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Video size={17} />
          Videos
        </Link>
        <Link
          href="/admin/media/gifs"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Film size={17} />
          GIFs
        </Link>

        <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
          Analytics
        </span>
        <Link
          href="/admin/analytics"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Activity size={17} />
          Overview
        </Link>
        <Link
          href="/admin/analytics/games"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <TrendingUp size={17} />
          Games & Categories
        </Link>
        <Link
          href="/admin/analytics/users"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Users size={17} />
          Users & Search
        </Link>
        <Link
          href="/admin/analytics/content-health"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <HeartPulse size={17} />
          Content Health
        </Link>
        <Link
          href="/admin/analytics/integrations"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Plug size={17} />
          Connect Integrations
        </Link>

        <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
          SEO Management
        </span>
        <Link
          href="/admin/seo"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Search size={17} />
          Global Settings
        </Link>
        <Link
          href="/admin/seo/sitemaps"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Map size={17} />
          Sitemaps
        </Link>
        <Link
          href="/admin/seo/robots"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ScrollText size={17} />
          Robots.txt
        </Link>
        <Link
          href="/admin/seo/redirects"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Link2 size={17} />
          Redirects
        </Link>
        <Link
          href="/admin/seo/structured-data"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Braces size={17} />
          Structured Data
        </Link>
        <Link
          href="/admin/seo/analysis"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <BarChart3 size={17} />
          SEO Analysis
        </Link>

        <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
          Localization
        </span>
        <Link
          href="/admin/localization/languages"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Languages size={17} />
          Languages
        </Link>
        <Link
          href="/admin/localization/currencies"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Coins size={17} />
          Currency
        </Link>
        <Link
          href="/admin/localization/translations"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Type size={17} />
          Translations
        </Link>
        <Link
          href="/admin/localization/region"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <MapPin size={17} />
          Region Settings
        </Link>
        <Link
          href="/admin/localization/advanced"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Sliders size={17} />
          Advanced
        </Link>
          </>
        )}

        {isStaff && (
          <>
            {!isAdmin && canModerateComments && (
              <>
                <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
                  Moderation
                </span>
                <Link
                  href="/admin/comments"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <MessageSquare size={17} />
                  Comments
                </Link>
                <Link
                  href="/admin/reviews"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Star size={17} />
                  Reviews
                </Link>
              </>
            )}
            <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
              User Management
            </span>
            <Link
              href="/admin/users"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Users size={17} />
              Users
            </Link>
            {isAdmin && (
              <Link
                href="/admin/users/roles"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ShieldQuestion size={17} />
                Roles & Permissions
              </Link>
            )}
            {canBan && (
              <Link
                href="/admin/users/banned"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Ban size={17} />
                Banned Users
              </Link>
            )}
            {canVerify && (
              <Link
                href="/admin/users/verification"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                <BadgeCheck size={17} />
                User Verification
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin/users/sessions"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                <KeyRound size={17} />
                Login & Sessions
              </Link>
            )}
            {canViewActivity && (
              <Link
                href="/admin/users/activity"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              >
                <History size={17} />
                Activity Logs
              </Link>
            )}
            {(canManageReports || canManageCopyright) && (
              <>
                <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
                  Reports & Moderation
                </span>
                <Link
                  href="/admin/reports"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Inbox size={17} />
                  Report Queue
                </Link>
                <Link
                  href="/admin/reports/history"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Archive size={17} />
                  Report History
                </Link>
                <Link
                  href="/admin/reports/categories"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <FolderKanban size={17} />
                  Report Categories
                </Link>
                {canManageReports && (
                  <>
                    <span className="mb-0.5 mt-2 px-3 text-[10px] font-bold uppercase tracking-wider text-white/40">
                      User Reports
                    </span>
                    <Link
                      href="/admin/reports/user"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Flag size={17} />
                      User Reports
                    </Link>
                    <span className="mb-0.5 mt-2 px-3 text-[10px] font-bold uppercase tracking-wider text-white/40">
                      Abuse & Moderation
                    </span>
                    <Link
                      href="/admin/reports/abuse"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <ShieldAlert size={17} />
                      Abuse Reports
                    </Link>
                    <Link
                      href="/admin/reports/spam"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <MailWarning size={17} />
                      Spam Reports
                    </Link>
                    <Link
                      href="/admin/reports/harassment"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <MessagesSquare size={17} />
                      Harassment / Hate Speech
                    </Link>
                    <Link
                      href="/admin/reports/impersonation"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <UserX size={17} />
                      Impersonation
                    </Link>
                    <Link
                      href="/admin/reports/inappropriate"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <AlertTriangle size={17} />
                      Inappropriate Content
                    </Link>
                  </>
                )}
                {canManageCopyright && (
                  <>
                    <span className="mb-0.5 mt-2 px-3 text-[10px] font-bold uppercase tracking-wider text-white/40">
                      Copyright
                    </span>
                    <Link
                      href="/admin/reports/copyright"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Copyright size={17} />
                      Copyright Requests
                    </Link>
                    <Link
                      href="/admin/reports/dmca"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Gavel size={17} />
                      DMCA Requests
                    </Link>
                    <Link
                      href="/admin/reports/counter-notices"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Undo2 size={17} />
                      Counter-Notices
                    </Link>
                    <Link
                      href="/admin/reports/copyright-history"
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Scale size={17} />
                      Copyright Claim History
                    </Link>
                  </>
                )}
                <span className="mb-0.5 mt-2 px-3 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Administration
                </span>
                <Link
                  href="/admin/reports/audit-log"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ListChecks size={17} />
                  Audit Log
                </Link>
              </>
            )}
            {isAdmin && (
              <>
                <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
                  Security
                </span>
                <Link
                  href="/admin/security"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ShieldCheck size={17} />
                  Settings
                </Link>
                <Link
                  href="/admin/security/access"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Ban size={17} />
                  Access Control
                </Link>
                <Link
                  href="/admin/security/api-keys"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <KeyRound size={17} />
                  API Keys
                </Link>
                <Link
                  href="/admin/security/backups"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <HardDriveDownload size={17} />
                  Backups
                </Link>
                <Link
                  href="/admin/backup"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Database size={17} />
                  Backup &amp; Migration
                </Link>
                <Link
                  href="/admin/security/logs"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ScrollText size={17} />
                  Login Logs
                </Link>
                <Link
                  href="/admin/security/action-log"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ClipboardList size={17} />
                  Action Log
                </Link>
                <Link
                  href="/admin/security/alerts"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ShieldAlert size={17} />
                  Alerts
                </Link>
                <Link
                  href="/admin/security/maintenance"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Wrench size={17} />
                  Maintenance
                </Link>

                <span className="mb-1 mt-3 inline-flex w-fit items-center rounded-full bg-[var(--color-menu-yellow)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-black">
                  Cache
                </span>
                <Link
                  href="/admin/cache"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Database size={17} />
                  Overview
                </Link>
                <Link
                  href="/admin/cache/browser"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Gauge size={17} />
                  Browser Cache
                </Link>
                <Link
                  href="/admin/cache/cdn"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Globe size={17} />
                  CDN / Edge Cache
                </Link>
                <Link
                  href="/admin/cache/php-opcode"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Cpu size={17} />
                  PHP OPcache
                </Link>
                <Link
                  href="/admin/cache/fragment"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Layers3 size={17} />
                  Fragment Cache
                </Link>
                <Link
                  href="/admin/cache/static-assets"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <FileCode size={17} />
                  Static Asset Cache
                </Link>
                <Link
                  href="/admin/cache/dns"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Network size={17} />
                  DNS Cache
                </Link>
                <Link
                  href="/admin/cache/edge"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Zap size={17} />
                  Edge Cache
                </Link>
                <Link
                  href="/admin/cache/session"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Lock size={17} />
                  Session Cache
                </Link>
                <Link
                  href="/admin/cache/search"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Search size={17} />
                  Search Cache
                </Link>
                <Link
                  href="/admin/cache/metadata"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Braces size={17} />
                  Metadata Cache
                </Link>
                <Link
                  href="/admin/cache/feed"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Rss size={17} />
                  Feed Cache
                </Link>
                <Link
                  href="/admin/cache/media"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Film size={17} />
                  Media Cache
                </Link>
                <Link
                  href="/admin/cache/preloading"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Rocket size={17} />
                  Preloading &amp; Prefetching
                </Link>
                <Link
                  href="/admin/cache/smart"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <BrainCircuit size={17} />
                  Smart Cache
                </Link>
                <Link
                  href="/admin/cache/compression"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Minimize2 size={17} />
                  Compression
                </Link>
                <Link
                  href="/admin/cache/security"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Fingerprint size={17} />
                  Security
                </Link>
              </>
            )}
          </>
        )}
      </aside>
      <main className="min-w-0 flex-1 p-6 sm:p-8">{children}</main>
    </div>
  );
}
