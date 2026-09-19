import { createClient } from "./supabase/server";
import { mapDbCategoryRow, type DbCategoryRow } from "./games-mapping";
import { fetchGameBySlugLive } from "./games-server";
import { fetchTagBySlugLive } from "./content-server";
import { getSeoSettings } from "./seo-settings";
import { buildGameMetadata, buildCategoryMetadata, applyTitleTemplate, absoluteUrl, buildRobotsMeta } from "./seo";
import type { MetadataCacheSettings, SeoEntityType, DeveloperSortBy, PublisherSortBy } from "./metadata-cache-settings";

// Server-only. Shared between POST .../warm and POST .../preview (both
// under src/app/api/admin/cache/metadata/**) — one place for "what does
// a real, fully-resolved record look like for this namespace", so the
// two routes can't drift apart. Every resolver here calls a *raw* fetch
// (fetchGameBySlugLive, fetchTagBySlugLive, or a direct Supabase query),
// never the cache-wrapping public function (getRealGameBySlug,
// getTagBySlug) — these resolvers ARE the compute() callback that gets
// passed into getOrSetMetadataCache, so calling the cache-wrapping
// version here would nest a second get-or-set under the exact same key.

// ── 1. Categories ────────────────────────────────────────────────────────

export interface CategoryCachePayload {
  slug: string;
  name: string;
  icon: string;
  colorFrom: string;
  colorTo: string;
  description: string;
  seo?: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    focusKeyword: string | null;
    h1Title: string | null;
    index: boolean;
  };
  gameCount?: number;
}

export async function resolveCategoryPayload(
  slug: string,
  settings: MetadataCacheSettings
): Promise<CategoryCachePayload | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
  if (error || !data) return null;
  const category = mapDbCategoryRow(data as DbCategoryRow);

  const payload: CategoryCachePayload = {
    slug: category.slug,
    name: category.name,
    icon: category.icon,
    colorFrom: category.colorFrom,
    colorTo: category.colorTo,
    description: category.description,
  };

  if (settings.categoriesIncludeSeoFields) {
    payload.seo = {
      title: category.seoTitle || null,
      description: category.seoDescription || null,
      canonicalUrl: category.seoCanonicalUrl ?? null,
      focusKeyword: category.seoFocusKeyword || null,
      h1Title: category.seoH1Title || null,
      index: category.seoIndex ?? true,
    };
  }

  if (settings.categoriesIncludeGameCounts) {
    const { count } = await supabase
      .from("games")
      .select("*", { count: "exact", head: true })
      .eq("category_slug", slug)
      .eq("is_published", true)
      .eq("visibility", "public");
    payload.gameCount = count ?? 0;
  }

  return payload;
}

export async function listAllCategorySlugs(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("slug").order("slug", { ascending: true });
  return (data ?? []).map((r) => r.slug as string);
}

// ── 2. Tags ───────────────────────────────────────────────────────────────

export interface TagCachePayload {
  slug: string;
  name: string;
  color: string;
  seo?: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    h1Title: string | null;
    index: boolean;
  };
  usage?: { gameCount: number; postCount: number };
}

export async function resolveTagPayload(
  slug: string,
  settings: MetadataCacheSettings
): Promise<TagCachePayload | null> {
  const tag = await fetchTagBySlugLive(slug);
  if (!tag) return null;

  const payload: TagCachePayload = { slug: tag.slug, name: tag.name, color: tag.color };

  if (settings.tagsIncludeSeoFields) {
    payload.seo = {
      title: tag.seoTitle || null,
      description: tag.seoDescription || null,
      canonicalUrl: tag.seoCanonicalUrl,
      h1Title: tag.seoH1Title || null,
      index: tag.seoIndex,
    };
  }

  if (settings.tagsIncludeUsageCounts) {
    const supabase = await createClient();
    const { data: tagRow } = await supabase.from("tags").select("id").eq("slug", slug).maybeSingle();
    let gameCount = 0;
    let postCount = 0;
    if (tagRow) {
      const [{ count: gc }, { count: pc }] = await Promise.all([
        supabase.from("game_tags").select("*", { count: "exact", head: true }).eq("tag_id", tagRow.id),
        supabase.from("post_tags").select("*", { count: "exact", head: true }).eq("tag_id", tagRow.id),
      ]);
      gameCount = gc ?? 0;
      postCount = pc ?? 0;
    }
    payload.usage = { gameCount, postCount };
  }

  return payload;
}

export async function listAllTagSlugs(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("tags").select("slug").order("slug", { ascending: true });
  return (data ?? []).map((r) => r.slug as string);
}

// ── 3 & 4. Developers / Publishers ───────────────────────────────────────

export interface FacetPayload {
  name: string;
  gameCount: number;
  avgRating: number | null;
  computedAt: string | null;
}

async function resolveFacetRow(table: string, column: string, name: string): Promise<FacetPayload | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).select("*").eq(column, name).maybeSingle();
  if (error || !data) return null;
  return {
    name: String(data[column]),
    gameCount: Number(data.game_count ?? 0),
    avgRating: data.avg_rating === null || data.avg_rating === undefined ? null : Number(data.avg_rating),
    computedAt: data.computed_at ? String(data.computed_at) : null,
  };
}

async function listFacetRows(
  table: string,
  column: string,
  sortBy: DeveloperSortBy | PublisherSortBy
): Promise<FacetPayload[]> {
  const supabase = await createClient();
  const { data } = await supabase.from(table).select("*");
  const rows: FacetPayload[] = (data ?? []).map((r) => ({
    name: String(r[column]),
    gameCount: Number(r.game_count ?? 0),
    avgRating: r.avg_rating === null || r.avg_rating === undefined ? null : Number(r.avg_rating),
    computedAt: r.computed_at ? String(r.computed_at) : null,
  }));
  return sortBy === "name"
    ? rows.sort((a, b) => a.name.localeCompare(b.name))
    : rows.sort((a, b) => b.gameCount - a.gameCount);
}

export const resolveDeveloperPayload = (name: string) => resolveFacetRow("metadata_developer_facets", "developer", name);
export const resolvePublisherPayload = (name: string) => resolveFacetRow("metadata_publisher_facets", "publisher", name);
export const listDeveloperFacets = (sortBy: DeveloperSortBy) =>
  listFacetRows("metadata_developer_facets", "developer", sortBy);
export const listPublisherFacets = (sortBy: PublisherSortBy) =>
  listFacetRows("metadata_publisher_facets", "publisher", sortBy);

// ── 5. Game Metadata ─────────────────────────────────────────────────────

export interface GameMetadataCachePayload {
  slug: string;
  title: string;
  description: string;
  developer: string;
  publisher: string;
  categorySlug: string;
  categoryName: string;
  rating: number;
  plays: number;
  visibility: string;
  ratingCount?: number;
  favoriteCount?: number;
}

/** Always fetches the public-safe shape (restrictToPublic: true) — this
 * is the compute() function for the "games" namespace cache, so it must
 * never resolve a private/draft row (see getRealGameBySlug in
 * games-server.ts for why that matters). Previewing an admin-only game
 * from this tool isn't a supported case; the real page's own
 * bypass-for-admins path handles that instead. */
export async function resolveGameMetadataPayload(
  slug: string,
  settings: MetadataCacheSettings
): Promise<GameMetadataCachePayload | null> {
  const real = await fetchGameBySlugLive(slug, true);
  if (!real) return null;
  const { game, category } = real;

  const payload: GameMetadataCachePayload = {
    slug: game.slug,
    title: game.title,
    description: game.description ?? "",
    developer: game.developer || "",
    publisher: game.publisher || "",
    categorySlug: category.slug,
    categoryName: category.name,
    rating: game.rating,
    plays: game.plays,
    visibility: game.visibility ?? "public",
  };

  if (settings.gameMetadataIncludeRelatedCounts) {
    payload.ratingCount = game.ratingCount;
    payload.favoriteCount = game.favoriteCount;
  }

  return payload;
}

export async function listSampleGameSlugs(limit: number): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("games")
    .select("slug")
    .eq("is_published", true)
    .eq("visibility", "public")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => r.slug as string);
}

// ── 6. SEO Metadata ──────────────────────────────────────────────────────

/** Mirrors buildGameMetadata/buildCategoryMetadata's Metadata shape for
 * consistency, but tags have no dedicated builder in seo.ts yet — this
 * reproduces the exact inline logic src/app/tag/[slug]/page.tsx uses for
 * generateMetadata(), so what this cache stores matches what the real
 * page would compute (once that page is wired to read from here). */
export async function resolveSeoPayload(
  entityType: SeoEntityType,
  slug: string
): Promise<Record<string, unknown> | null> {
  const settings = await getSeoSettings();

  if (entityType === "games") {
    const real = await fetchGameBySlugLive(slug, true);
    if (!real) return null;
    return buildGameMetadata(real.game, real.category, settings) as unknown as Record<string, unknown>;
  }

  if (entityType === "categories") {
    const supabase = await createClient();
    const { data } = await supabase.from("categories").select("*").eq("slug", slug).maybeSingle();
    if (!data) return null;
    return buildCategoryMetadata(mapDbCategoryRow(data as DbCategoryRow), settings) as unknown as Record<
      string,
      unknown
    >;
  }

  if (entityType === "tags") {
    const tag = await fetchTagBySlugLive(slug);
    if (!tag) return null;
    const title =
      tag.seoTitle?.trim() ||
      applyTitleTemplate(settings.titleTemplate, { title: `${tag.name} Games & Posts`, site_name: settings.siteName });
    const description =
      tag.seoDescription?.trim() || `Posts and updates tagged "${tag.name}" on ${settings.siteName}.`;
    const canonical = tag.seoCanonicalUrl?.trim() || absoluteUrl(`/${tag.slug}`, settings);
    return {
      title,
      description,
      alternates: { canonical },
      robots: buildRobotsMeta({ index: tag.seoIndex ?? true, follow: true }),
      openGraph: { title, description, url: canonical, type: "website" },
    };
  }

  // "pages" is reserved in seoMetadataEntityTypes for a future
  // buildPageMetadata()-backed resolver — no page-level caller exists
  // yet, so there's nothing to resolve.
  return null;
}
