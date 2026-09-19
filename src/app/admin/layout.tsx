import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSecuritySettingsServer } from "@/lib/security-server";
import { AdminChrome } from "@/components/admin/layout/AdminChrome";
import { buildAdminNav, buildTopLinks, type AdminNavPerms } from "@/components/admin/layout/adminNavConfig";

export const metadata: Metadata = {
  title: "Admin — MofiGames",
  robots: { index: false, follow: false },
};

/**
 * Guards every /admin/* route. Checked here on the server (not just via a
 * client-side redirect) so the admin UI never even renders for a
 * non-admin — RLS on the games/categories tables backs this up regardless,
 * but this avoids the flash-of-protected-content problem entirely.
 *
 * The sidebar/header chrome itself lives in AdminChrome (client component,
 * for collapse/drawer/search interactivity) — this file's job is purely:
 * authenticate, compute permissions, build the nav data, render the shell.
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

  // Which User Management / Report & Moderation sub-screens this viewer can
  // act on — computed once here via the same has_permission() RPC everything
  // else uses, so the sidebar never shows a link to a screen that would just
  // 403. Admin sees everything; other sections (Content Management, SEO,
  // Analytics) stay admin-only until their routes are retrofitted with the
  // same permission model.
  const [canBan, canVerify, canManageReports, canViewActivity, canModerateComments, canManageCopyright] = isAdmin
    ? [true, true, true, true, true, true]
    : await Promise.all(
        (
          ["ban_users", "verify_users", "manage_reports", "view_activity_logs", "moderate_comments", "manage_copyright"] as const
        ).map((perm) => supabase.rpc("has_permission", { perm }).then(({ data }) => Boolean(data)))
      );

  const perms: AdminNavPerms = {
    isAdmin,
    isStaff,
    canBan,
    canVerify,
    canManageReports,
    canViewActivity,
    canModerateComments,
    canManageCopyright,
  };

  const topLinks = buildTopLinks(perms);
  const groups = buildAdminNav(perms);

  const roleLabel = isAdmin ? "Admin" : role === "editor" ? "Editor" : "Moderator";

  // Real pending-reports count for the header notification bell — only
  // fetched (and only shown) for viewers who can actually act on reports,
  // and only ever a genuine count. No fabricated numbers.
  let pendingReportsCount: number | null = null;
  if (canManageReports || canManageCopyright) {
    const { count } = await supabase
      .from("user_reports")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "reviewed"]);
    pendingReportsCount = count ?? 0;
  }

  return (
    <AdminChrome topLinks={topLinks} groups={groups} roleLabel={roleLabel} pendingReportsCount={pendingReportsCount}>
      {children}
    </AdminChrome>
  );
}
