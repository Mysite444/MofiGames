import { createClient } from "./supabase/server";
import { withTimeout, isNextControlFlowError, DEFAULT_SUPABASE_TIMEOUT_MS } from "./supabase/timeout-fetch";
import { getOrSetMetadataCache } from "./metadata-cache";
import { fallbackPageBySlug } from "./static-fallback";

// Server-only. RLS already restricts non-admins to is_published=true rows,
// so a signed-in admin previewing a draft's real URL still works while
// everyone else only ever sees published content — same pattern as
// getRealGameBySlug in lib/games-server.ts.

export interface PublicPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  metaDescription: string;
  showInNav: boolean;
  seoTitle: string;
  seoCanonicalUrl: string | null;
  seoH1Title: string;
  seoIndex: boolean;
  ogImageUrl: string | null;
}

export interface PublicTag {
  id: string;
  slug: string;
  name: string;
  color: string;
}

export interface PublicPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImageUrl: string | null;
  authorName: string;
  publishedAt: string;
  tags: PublicTag[];
  seoTitle: string;
  seoDescription: string;
  seoCanonicalUrl: string | null;
  seoFocusKeyword: string;
  seoSecondaryKeywords: string[];
  seoH1Title: string;
  seoIndex: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string | null;
  ogImageAlt: string;
  twitterCard: "summary" | "summary_large_image" | "app" | "player";
}

/** Backs About Us, Contact Us, and every admin-created custom page at
 * /[pageSlug] (see src/app/[pageSlug]/page.tsx) — the nav-linked,
 * content-driven pages this app treats as "should basically never go
 * down." Falls back to the static snapshot (src/data/fallback/pages.json)
 * on any live-read failure; that snapshot always includes "about" and
 * "contact" (seeded with the same copy those two page components already
 * hardcode as their own last-resort inline fallback), so a Supabase
 * outage still serves real page content instead of an error — the page
 * components' own FALLBACK_CONTENT only ever gets used if the snapshot
 * file itself is somehow missing too. */
export async function getPageBySlug(slug: string): Promise<PublicPage | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase.from("pages").select("*").eq("slug", slug).maybeSingle(),
      DEFAULT_SUPABASE_TIMEOUT_MS,
      `page "${slug}"`
    );
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      slug: data.slug,
      title: data.title,
      content: data.content,
      metaDescription: data.meta_description,
      showInNav: data.show_in_nav,
      seoTitle: data.seo_title ?? "",
      seoCanonicalUrl: data.seo_canonical_url ?? null,
      seoH1Title: data.seo_h1_title ?? "",
      seoIndex: data.seo_index ?? true,
      ogImageUrl: data.og_image_url ?? null,
    };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error(`[content-server] getPageBySlug("${slug}") falling back to static snapshot:`, err);
    return fallbackPageBySlug(slug);
  }
}

async function attachTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postIds: string[]
): Promise<Map<string, PublicTag[]>> {
  if (postIds.length === 0) return new Map();
  const { data } = await supabase
    .from("post_tags")
    .select("post_id, tags(id, slug, name, color)")
    .in("post_id", postIds);

  const map = new Map<string, PublicTag[]>();
  for (const row of data ?? []) {
    const tag = row.tags as unknown as PublicTag | null;
    if (!tag) continue;
    const list = map.get(row.post_id) ?? [];
    list.push(tag);
    map.set(row.post_id, list);
  }
  return map;
}

/** Blog isn't in the explicit "must survive an outage" list (games,
 * categories, nav, About/Contact) the way getPageBySlug's callers are,
 * but it must still never crash a page — wrapped so a live failure
 * degrades to "no posts shown" instead of an unhandled rejection. */
export async function getPublishedPosts(limit = 30): Promise<PublicPost[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase.from("posts").select("*").eq("is_published", true).order("published_at", { ascending: false }).limit(limit),
      DEFAULT_SUPABASE_TIMEOUT_MS,
      "published posts"
    );
    if (error || !data) throw error ?? new Error("posts: empty response");

    const tagsByPost = await attachTags(supabase, data.map((p) => p.id));

    return data.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      content: row.content,
      coverImageUrl: row.cover_image_url,
      authorName: row.author_name,
    publishedAt: row.published_at,
    tags: tagsByPost.get(row.id) ?? [],
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    seoCanonicalUrl: row.seo_canonical_url ?? null,
    seoFocusKeyword: row.seo_focus_keyword ?? "",
    seoSecondaryKeywords: row.seo_secondary_keywords ?? [],
    seoH1Title: row.seo_h1_title ?? "",
    seoIndex: row.seo_index ?? true,
    ogTitle: row.og_title ?? "",
    ogDescription: row.og_description ?? "",
    ogImageUrl: row.og_image_url ?? null,
    ogImageAlt: row.og_image_alt ?? "",
    twitterCard: row.twitter_card ?? "summary_large_image",
    }));
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("[content-server] getPublishedPosts failed, returning no posts:", err);
    return [];
  }
}

export interface PublicTagDetail extends PublicTag {
  seoTitle: string;
  seoDescription: string;
  seoCanonicalUrl: string | null;
  seoH1Title: string;
  seoIndex: boolean;
}

/** Wired into the Tags namespace of Admin → Cache → Metadata Cache — see
 * metadata-cache.ts. Unlike getRealGameBySlug in games-server.ts, tags
 * have no draft/published concept ("Tags are publicly readable" is the
 * only RLS policy on the table, migration 0007), so this is a direct
 * wrap with no visibility filtering to worry about: every tag row is
 * always safe to share across every caller. */
export async function getTagBySlug(slug: string): Promise<PublicTagDetail | null> {
  try {
    const { value } = await getOrSetMetadataCache("tags", slug, () => fetchTagBySlugLive(slug));
    return value;
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error(`[content-server] getTagBySlug("${slug}") failed:`, err);
    return null;
  }
}

export async function fetchTagBySlugLive(slug: string): Promise<PublicTagDetail | null> {
  const supabase = await createClient();
  const { data, error } = await withTimeout(
    supabase.from("tags").select("*").eq("slug", slug).maybeSingle(),
    DEFAULT_SUPABASE_TIMEOUT_MS,
    `tag "${slug}"`
  );
  if (error || !data) return null;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    color: data.color,
    seoTitle: data.seo_title ?? "",
    seoDescription: data.seo_description ?? "",
    seoCanonicalUrl: data.seo_canonical_url ?? null,
    seoH1Title: data.seo_h1_title ?? "",
    seoIndex: data.seo_index ?? true,
  };
}

/** Every published post carrying a given tag — backs the /tag/[slug]
 * archive page and its sitemap entry (only tags with at least one post
 * are included there, see src/app/sitemaps/tags.xml/route.ts). */
export async function getPostsByTag(tagSlug: string): Promise<PublicPost[]> {
  try {
    const supabase = await createClient();
    const { data: tag } = await supabase.from("tags").select("id").eq("slug", tagSlug).maybeSingle();
    if (!tag) return [];

    const { data: links } = await supabase.from("post_tags").select("post_id").eq("tag_id", tag.id);
    const postIds = (links ?? []).map((l) => l.post_id);
    if (postIds.length === 0) return [];

    const { data, error } = await withTimeout(
      supabase.from("posts").select("*").in("id", postIds).eq("is_published", true).order("published_at", { ascending: false }),
      DEFAULT_SUPABASE_TIMEOUT_MS,
      `posts by tag "${tagSlug}"`
    );
    if (error || !data) throw error ?? new Error("posts by tag: empty response");

    const tagsByPost = await attachTags(supabase, data.map((p) => p.id));

    return data.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      content: row.content,
      coverImageUrl: row.cover_image_url,
      authorName: row.author_name,
      publishedAt: row.published_at,
      tags: tagsByPost.get(row.id) ?? [],
      seoTitle: row.seo_title ?? "",
      seoDescription: row.seo_description ?? "",
      seoCanonicalUrl: row.seo_canonical_url ?? null,
      seoFocusKeyword: row.seo_focus_keyword ?? "",
      seoSecondaryKeywords: row.seo_secondary_keywords ?? [],
      seoH1Title: row.seo_h1_title ?? "",
      seoIndex: row.seo_index ?? true,
      ogTitle: row.og_title ?? "",
      ogDescription: row.og_description ?? "",
      ogImageUrl: row.og_image_url ?? null,
      ogImageAlt: row.og_image_alt ?? "",
      twitterCard: row.twitter_card ?? "summary_large_image",
    }));
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error(`[content-server] getPostsByTag("${tagSlug}") failed, returning no posts:`, err);
    return [];
  }
}

export async function getPostBySlug(slug: string): Promise<PublicPost | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await withTimeout(
      supabase.from("posts").select("*").eq("slug", slug).maybeSingle(),
      DEFAULT_SUPABASE_TIMEOUT_MS,
      `post "${slug}"`
    );
    if (error) throw error;
    if (!data) return null;

    const tagsByPost = await attachTags(supabase, [data.id]);

    return {
      id: data.id,
      slug: data.slug,
      title: data.title,
      excerpt: data.excerpt,
      content: data.content,
      coverImageUrl: data.cover_image_url,
      authorName: data.author_name,
      publishedAt: data.published_at,
      tags: tagsByPost.get(data.id) ?? [],
      seoTitle: data.seo_title ?? "",
      seoDescription: data.seo_description ?? "",
      seoCanonicalUrl: data.seo_canonical_url ?? null,
      seoFocusKeyword: data.seo_focus_keyword ?? "",
      seoSecondaryKeywords: data.seo_secondary_keywords ?? [],
      seoH1Title: data.seo_h1_title ?? "",
      seoIndex: data.seo_index ?? true,
      ogTitle: data.og_title ?? "",
      ogDescription: data.og_description ?? "",
      ogImageUrl: data.og_image_url ?? null,
      ogImageAlt: data.og_image_alt ?? "",
      twitterCard: data.twitter_card ?? "summary_large_image",
    };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error(`[content-server] getPostBySlug("${slug}") failed:`, err);
    return null;
  }
}
