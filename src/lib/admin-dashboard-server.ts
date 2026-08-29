import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminDashboardStats {
  totalGames: number | null;
  publishedGames: number | null;
  draftGames: number | null;
  totalPosts: number | null;
  publishedPosts: number | null;
  totalUsers: number | null;
  totalReviews: number | null;
  pendingReports: number | null;
  mediaCount: number | null;
  mediaBytes: number | null;
  popularGames: { id: string; slug: string; title: string; plays: number }[];
  recentGames: { id: string; slug: string; title: string; is_published: boolean; created_at: string }[];
  recentActivity: { id: string; actor_email: string | null; summary: string; action: string; created_at: string }[];
}

/**
 * Every field here is a real Supabase count/select — none of it is
 * invented. Each query is isolated in its own try/catch so one failing
 * table (e.g. RLS denies a viewer read access to something) degrades that
 * single card to an empty state instead of breaking the whole dashboard.
 */
export async function getAdminDashboardStats(
  supabase: SupabaseClient,
  opts: { canManageReports: boolean; canViewUsers: boolean }
): Promise<AdminDashboardStats> {
  const safeCount = async (fn: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const { count, error } = await fn();
      if (error) return null;
      return count ?? 0;
    } catch {
      return null;
    }
  };

  const [
    totalGames,
    publishedGames,
    draftGames,
    totalPosts,
    publishedPosts,
    totalUsers,
    totalReviews,
    pendingReports,
    mediaAgg,
    popularGamesRes,
    recentGamesRes,
    recentActivityRes,
  ] = await Promise.all([
    safeCount(() => supabase.from("games").select("*", { count: "exact", head: true })),
    safeCount(() => supabase.from("games").select("*", { count: "exact", head: true }).eq("is_published", true)),
    safeCount(() => supabase.from("games").select("*", { count: "exact", head: true }).eq("is_published", false)),
    safeCount(() => supabase.from("posts").select("*", { count: "exact", head: true })),
    safeCount(() => supabase.from("posts").select("*", { count: "exact", head: true }).eq("is_published", true)),
    opts.canViewUsers
      ? safeCount(() => supabase.from("profiles").select("*", { count: "exact", head: true }))
      : Promise.resolve(null),
    safeCount(() => supabase.from("game_reviews").select("*", { count: "exact", head: true })),
    opts.canManageReports
      ? safeCount(() =>
          supabase.from("user_reports").select("*", { count: "exact", head: true }).in("status", ["pending", "reviewed"])
        )
      : Promise.resolve(null),
    (async () => {
      try {
        const { data, error } = await supabase.from("media_assets").select("file_size");
        if (error || !data) return { count: null, bytes: null };
        const bytes = data.reduce((sum, row) => sum + (Number(row.file_size) || 0), 0);
        return { count: data.length, bytes };
      } catch {
        return { count: null, bytes: null };
      }
    })(),
    (async () => {
      try {
        const { data } = await supabase
          .from("games")
          .select("id, slug, title, plays")
          .eq("is_published", true)
          .order("plays", { ascending: false })
          .limit(5);
        return data ?? [];
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const { data } = await supabase
          .from("games")
          .select("id, slug, title, is_published, created_at")
          .order("created_at", { ascending: false })
          .limit(5);
        return data ?? [];
      } catch {
        return [];
      }
    })(),
    opts.canManageReports
      ? (async () => {
          try {
            const { data } = await supabase
              .from("admin_action_log")
              .select("id, actor_email, summary, action, created_at")
              .order("created_at", { ascending: false })
              .limit(6);
            return data ?? [];
          } catch {
            return [];
          }
        })()
      : Promise.resolve([]),
  ]);

  return {
    totalGames,
    publishedGames,
    draftGames,
    totalPosts,
    publishedPosts,
    totalUsers,
    totalReviews,
    pendingReports,
    mediaCount: mediaAgg.count,
    mediaBytes: mediaAgg.bytes,
    popularGames: popularGamesRes,
    recentGames: recentGamesRes,
    recentActivity: recentActivityRes,
  };
}
