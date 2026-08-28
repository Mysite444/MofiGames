import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { categories as placeholderCategories } from "@/lib/categories";

/** POST /api/admin/cache/feed/purge-sitemaps
 * Admin-only. The sitemaps under /sitemaps/*.xml are generated live from
 * the database on every request (no server-side store to actually flush
 * — see the comment at the top of SeoSitemapsAdminClient.tsx), so
 * "purge" here means what it means for image-cache and full-page-cache
 * when there's no real external cache wired up yet: an honest,
 * timestamped signal for ops ("we told the CDN/crawlers to re-check as
 * of this moment"), backed by a real count per sitemap type — not a
 * fabricated number — using the same filters each /sitemaps/*.xml route
 * applies. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const [gamesRes, categoriesRes, tagsRes, blogRes, pagesRes, imagesRes] = await Promise.all([
    supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("is_published", true)
      .eq("visibility", "public")
      .eq("seo_index", true),
    supabase.from("categories").select("slug, seo_index"),
    supabase.from("tags").select("*", { count: "exact", head: true }).eq("seo_index", true),
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("is_published", true).eq("seo_index", true),
    supabase.from("pages").select("*", { count: "exact", head: true }).eq("is_published", true).eq("seo_index", true),
    supabase
      .from("games")
      .select("thumbnail_url, cover_image_url")
      .eq("is_published", true)
      .eq("visibility", "public")
      .eq("seo_index", true),
  ]);

  const realCategorySlugs = new Set(
    (categoriesRes.data ?? []).filter((c) => c.seo_index !== false).map((c) => c.slug)
  );
  const categoriesCount = new Set([...placeholderCategories.map((c) => c.slug), ...realCategorySlugs]).size;
  const imagesCount = (imagesRes.data ?? []).filter((g) => g.thumbnail_url || g.cover_image_url).length;

  const summary = {
    games: gamesRes.count ?? 0,
    categories: categoriesCount,
    tags: tagsRes.count ?? 0,
    blog: blogRes.count ?? 0,
    pages: pagesRes.count ?? 0,
    images: imagesCount,
  };
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("feed_cache_settings")
    .update({
      sitemap_last_purged_at: now,
      sitemap_last_purge_summary: summary,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ summary, settings: null, warning: "Purge ran but failed to record the result." }, { status: 207 });
  }

  return NextResponse.json({ summary, settings: data });
}
