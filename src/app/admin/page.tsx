import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Gamepad2,
  FileCheck2,
  FileClock,
  Newspaper,
  Users,
  Flag,
  Star,
  HardDrive,
  TrendingUp,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAdminDashboardStats } from "@/lib/admin-dashboard-server";
import { formatPlays } from "@/lib/format-plays";

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: number | null;
  href?: string;
}) {
  const content = (
    <div className="glass flex items-center gap-3 rounded-xl p-4 transition-colors hover:bg-white/[0.06]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-white">
          {value === null ? <span className="text-text-faint">—</span> : value.toLocaleString()}
        </p>
        <p className="mt-1 truncate text-xs font-medium text-text-muted">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-6 text-center text-xs text-text-faint">{children}</p>;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.is_admin ? "admin" : profile?.role ?? "user";
  const isAdmin = role === "admin";

  const [canManageReports, canManageCopyright] = isAdmin
    ? [true, true]
    : await Promise.all(
        (["manage_reports", "manage_copyright"] as const).map((perm) =>
          supabase.rpc("has_permission", { perm }).then(({ data }) => Boolean(data))
        )
      );

  // Non-admin staff (editor/moderator) don't have a Content Management view
  // to land on — route them to whichever screen they actually have access
  // to instead of a dead end.
  if (!isAdmin) {
    redirect(canManageReports || canManageCopyright ? "/admin/reports" : "/admin/users");
  }

  const stats = await getAdminDashboardStats(supabase, { canManageReports: true, canViewUsers: true });

  const mediaMb = stats.mediaBytes !== null ? (stats.mediaBytes / (1024 * 1024)).toFixed(1) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">An overview of MofiGames&apos; content, users, and activity.</p>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Gamepad2} label="Total Games" value={stats.totalGames} href="/admin/games" />
        <StatCard icon={FileCheck2} label="Published Games" value={stats.publishedGames} href="/admin/games" />
        <StatCard icon={FileClock} label="Draft Games" value={stats.draftGames} href="/admin/games" />
        <StatCard icon={Newspaper} label="Total Posts" value={stats.totalPosts} href="/admin/posts" />
        <StatCard icon={Users} label="Users" value={stats.totalUsers} href="/admin/users" />
        <StatCard icon={Star} label="Reviews" value={stats.totalReviews} href="/admin/reviews" />
        <StatCard icon={Flag} label="Pending Reports" value={stats.pendingReports} href="/admin/reports" />
        <StatCard icon={HardDrive} label="Media Files" value={stats.mediaCount} href="/admin/media/images" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Popular games */}
        <div className="glass rounded-xl p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-white">
              <TrendingUp size={15} /> Popular Games
            </h2>
            <Link href="/admin/analytics/games" className="text-xs font-semibold text-text-faint hover:text-white">
              View all
            </Link>
          </div>
          {stats.popularGames.length === 0 ? (
            <EmptyRow>No published games yet</EmptyRow>
          ) : (
            <ul className="flex flex-col gap-1">
              {stats.popularGames.map((g, i) => (
                <li key={g.id}>
                  <Link
                    href={`/${g.slug}`}
                    target="_blank"
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-white/5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 shrink-0 text-xs font-bold text-text-faint">{i + 1}</span>
                      <span className="truncate font-medium text-white">{g.title}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-text-muted">{formatPlays(g.plays)} plays</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent games */}
        <div className="glass rounded-xl p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-white">
              <Gamepad2 size={15} /> Recent Games
            </h2>
            <Link href="/admin/games" className="text-xs font-semibold text-text-faint hover:text-white">
              Manage
            </Link>
          </div>
          {stats.recentGames.length === 0 ? (
            <EmptyRow>No games found</EmptyRow>
          ) : (
            <ul className="flex flex-col gap-1">
              {stats.recentGames.map((g) => (
                <li key={g.id}>
                  <Link
                    href="/admin/games"
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-white/5"
                  >
                    <span className="truncate font-medium text-white">{g.title}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        g.is_published ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-text-faint"
                      }`}
                    >
                      {g.is_published ? "Published" : "Draft"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent activity */}
        <div className="glass rounded-xl p-5 lg:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-white">
              <Clock size={15} /> Recent Activity
            </h2>
            <Link href="/admin/security/action-log" className="text-xs font-semibold text-text-faint hover:text-white">
              View log
            </Link>
          </div>
          {stats.recentActivity.length === 0 ? (
            <EmptyRow>No recent admin activity</EmptyRow>
          ) : (
            <ul className="flex flex-col gap-2">
              {stats.recentActivity.map((a) => (
                <li key={a.id} className="rounded-lg px-2 py-1.5 text-xs">
                  <p className="truncate font-medium text-white/90">{a.summary || a.action}</p>
                  <p className="mt-0.5 text-text-faint">
                    {a.actor_email ?? "System"} · {timeAgo(a.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* System quick links */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/admin/cache" className="glass flex items-center justify-between rounded-xl p-4 hover:bg-white/[0.06]">
          <div>
            <p className="text-sm font-semibold text-white">Cache</p>
            <p className="mt-0.5 text-xs text-text-muted">View status and clear caches</p>
          </div>
          <ArrowUpRight size={16} className="text-text-faint" />
        </Link>
        <Link href="/admin/media/images" className="glass flex items-center justify-between rounded-xl p-4 hover:bg-white/[0.06]">
          <div>
            <p className="text-sm font-semibold text-white">Media Storage</p>
            <p className="mt-0.5 text-xs text-text-muted">
              {stats.mediaCount === null ? "Unable to load storage info" : `${stats.mediaCount.toLocaleString()} files${mediaMb !== null ? ` · ${mediaMb} MB` : ""}`}
            </p>
          </div>
          <ArrowUpRight size={16} className="text-text-faint" />
        </Link>
      </div>
    </div>
  );
}
