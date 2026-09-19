import type { Game, Category, IconName } from "./types";
import { isIconName } from "./icon-map";

// Pure, environment-agnostic mapping from Supabase rows to the app's
// existing Game/Category shape. Used by both games-server.ts (Server
// Components, via the server Supabase client) and
// supabase/real-games-client.ts (client components, via the browser
// Supabase client) — kept here once so the two never drift apart.
//
// `gameFilesBaseUrl` is the one env-dependent input (see resolvePlayUrl
// below) — passed in rather than read from process.env here, so this
// module stays usable from both the server and browser bundles without
// caring which env var convention either environment uses.

export interface DbGameRow {
  id: string;
  slug: string;
  title: string;
  category_slug: string;
  description: string;
  instructions?: string | null;
  content?: string | null;
  controls?: string | null;
  thumbnail_url: string | null;
  cover_image_url?: string | null;
  landscape_cover_url?: string | null;
  square_cover_url?: string | null;
  portrait_cover_url?: string | null;
  video_trailer_url?: string | null;
  preview_video_url?: string | null;
  loading_screen_url?: string | null;
  estimated_loading_seconds?: number | null;
  play_type: "embed" | "upload";
  embed_url: string | null;
  storage_path: string | null;
  developer?: string | null;
  publisher?: string | null;
  release_date?: string | null;
  version?: string | null;
  tag: "TOP" | "HOT" | "NEW" | "UPDATED" | null;
  rating: number;
  rating_count?: number | null;
  plays: number;
  favorite_count?: number | null;
  multiplayer: boolean;
  mobile_support?: boolean | null;
  fullscreen_enabled?: boolean | null;
  save_progress_enabled?: boolean | null;
  width?: number | null;
  height?: number | null;
  orientation?: "landscape" | "portrait" | null;
  visibility?: "public" | "private" | "unlisted" | null;
  meta_title?: string | null;
  meta_description?: string | null;
  seo_canonical_url?: string | null;
  seo_focus_keyword?: string | null;
  seo_secondary_keywords?: string[] | null;
  seo_h1_title?: string | null;
  seo_excerpt?: string | null;
  seo_author?: string | null;
  seo_index?: boolean | null;
  seo_follow?: boolean | null;
  seo_max_snippet?: number | null;
  seo_max_image_preview?: "none" | "standard" | "large" | null;
  seo_max_video_preview?: number | null;
  seo_noarchive?: boolean | null;
  seo_nosnippet?: boolean | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  // Homepage placement
  show_on_homepage?: boolean | null;
  homepage_position?: number | null;
  homepage_label?: string | null;
  og_image_alt?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
  twitter_image_url?: string | null;
  twitter_image_alt?: string | null;
  twitter_card?: "summary" | "summary_large_image" | "app" | "player" | null;
  schema_video_game?: boolean | null;
  schema_software_application?: boolean | null;
  schema_review?: boolean | null;
  schema_breadcrumb?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_featured?: boolean;
  featured_order?: number | null;
  is_trending?: boolean | null;
  is_recommended?: boolean | null;
  is_editors_pick?: boolean;
  editors_pick_order?: number | null;
  is_sponsored?: boolean;
  sponsored_order?: number | null;
  sponsor_label?: string | null;
}

export interface DbCategoryRow {
  slug: string;
  name: string;
  icon: string;
  color_from: string;
  color_to: string;
  description: string;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_canonical_url?: string | null;
  seo_focus_keyword?: string | null;
  seo_h1_title?: string | null;
  seo_index?: boolean | null;
  breadcrumbs_enabled?: boolean | null;
  schema_collection_page?: boolean | null;
  og_image_url?: string | null;
  // Homepage placement
  show_on_homepage?: boolean | null;
  homepage_position?: number | null;
  homepage_label?: string | null;
  // Display template (migration 0066)
  display_style?: string | null;
  // Content blocks — heading + paragraph sections on the category page (migration 0074)
  content?: Array<{ heading: string; body: string }> | null;
}

function resolvePlayUrl(row: DbGameRow, gameFilesBaseUrl: string): string | undefined {
  if (row.play_type === "embed") return row.embed_url ?? undefined;
  if (row.play_type === "upload" && row.storage_path) {
    // storage_path is bucket-relative (e.g. "some-slug/index.html"), same
    // as it was for Supabase Storage — only the base URL and the fixed
    // "game-files" prefix changed, now pointing at Vercel Blob. See
    // NEXT_PUBLIC_BLOB_BASE_URL in .env.example.
    return `${gameFilesBaseUrl}/game-files/${row.storage_path}`;
  }
  return undefined;
}

export function mapDbGameRow(row: DbGameRow, gameFilesBaseUrl: string): Game {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    categorySlug: row.category_slug,
    // Derive a stable 0–5 visual variant from the game's UUID so every
    // GameThumbnail gradient card gets a visually distinct pattern and icon
    // rotation. Using the last 4 hex chars of the UUID gives good distribution
    // without needing a DB column. The result is deterministic — the same game
    // always maps to the same variant — so server and client renders match.
    variant: parseInt(row.id.replace(/-/g, "").slice(-4), 16) % 6,
    tag: row.tag,
    rating: row.rating,
    ratingCount: row.rating_count ?? 0,
    plays: row.plays,
    favoriteCount: row.favorite_count ?? 0,
    multiplayer: row.multiplayer,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    landscapeCoverUrl: row.landscape_cover_url ?? undefined,
    squareCoverUrl: row.square_cover_url ?? undefined,
    portraitCoverUrl: row.portrait_cover_url ?? undefined,
    videoTrailerUrl: row.video_trailer_url ?? undefined,
    previewVideoUrl: row.preview_video_url ?? undefined,
    loadingScreenUrl: row.loading_screen_url ?? undefined,
    estimatedLoadingSeconds: row.estimated_loading_seconds ?? null,
    playUrl: resolvePlayUrl(row, gameFilesBaseUrl),
    description: row.description,
    instructions: row.instructions ?? "",
    content: row.content ?? "",
    controls: row.controls ?? "",
    developer: row.developer ?? "",
    publisher: row.publisher ?? "",
    releaseDate: row.release_date ?? null,
    version: row.version ?? "",
    mobileSupport: row.mobile_support ?? true,
    fullscreenEnabled: row.fullscreen_enabled ?? true,
    saveProgressEnabled: row.save_progress_enabled ?? true,
    width: row.width ?? null,
    height: row.height ?? null,
    orientation: row.orientation ?? "landscape",
    visibility: row.visibility ?? "public",
    metaTitle: row.meta_title ?? "",
    metaDescription: row.meta_description ?? "",
    seoCanonicalUrl: row.seo_canonical_url ?? null,
    seoFocusKeyword: row.seo_focus_keyword ?? "",
    seoSecondaryKeywords: row.seo_secondary_keywords ?? [],
    seoH1Title: row.seo_h1_title ?? "",
    seoExcerpt: row.seo_excerpt ?? "",
    seoAuthor: row.seo_author ?? "",
    seoIndex: row.seo_index ?? true,
    seoFollow: row.seo_follow ?? true,
    seoMaxSnippet: row.seo_max_snippet ?? -1,
    seoMaxImagePreview: row.seo_max_image_preview ?? "large",
    seoMaxVideoPreview: row.seo_max_video_preview ?? -1,
    seoNoarchive: row.seo_noarchive ?? false,
    seoNosnippet: row.seo_nosnippet ?? false,
    ogTitle: row.og_title ?? "",
    ogDescription: row.og_description ?? "",
    ogImageUrl: row.og_image_url ?? null,
    showOnHomepage: row.show_on_homepage ?? true,
    homepagePosition: row.homepage_position ?? null,
    homepageLabel: row.homepage_label ?? null,
    ogImageAlt: row.og_image_alt ?? "",
    twitterTitle: row.twitter_title ?? "",
    twitterDescription: row.twitter_description ?? "",
    twitterImageUrl: row.twitter_image_url ?? null,
    twitterImageAlt: row.twitter_image_alt ?? "",
    twitterCard: row.twitter_card ?? "summary_large_image",
    schemaVideoGame: row.schema_video_game ?? true,
    schemaSoftwareApplication: row.schema_software_application ?? true,
    schemaReview: row.schema_review ?? false,
    schemaBreadcrumb: row.schema_breadcrumb ?? true,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    isFeatured: row.is_featured ?? false,
    featuredOrder: row.featured_order ?? null,
    isTrending: row.is_trending ?? false,
    isRecommended: row.is_recommended ?? false,
    isEditorsPick: row.is_editors_pick ?? false,
    editorsPickOrder: row.editors_pick_order ?? null,
    isSponsored: row.is_sponsored ?? false,
    sponsoredOrder: row.sponsored_order ?? null,
    sponsorLabel: row.sponsor_label ?? null,
  };
}

// A category's icon comes from a free-text admin form field (validated on
// the way in as of the current admin API, but older rows — or a row
// edited directly in the database — could still hold a value that isn't
// one of the Lucide icons the site actually has mapped). Falling back to
// a sane default here means every single place that does
// `iconMap[category.icon]` across the app can trust the value is always
// valid, instead of every one of those ~13 call sites needing its own
// fallback.
const FALLBACK_ICON: IconName = "Gamepad2";

export function mapDbCategoryRow(row: DbCategoryRow): Category {
  return {
    slug: row.slug,
    name: row.name,
    icon: isIconName(row.icon) ? row.icon : FALLBACK_ICON,
    colorFrom: row.color_from,
    colorTo: row.color_to,
    description: row.description,
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    seoCanonicalUrl: row.seo_canonical_url ?? null,
    seoFocusKeyword: row.seo_focus_keyword ?? "",
    seoH1Title: row.seo_h1_title ?? "",
    seoIndex: row.seo_index ?? true,
    breadcrumbsEnabled: row.breadcrumbs_enabled ?? true,
    schemaCollectionPage: row.schema_collection_page ?? true,
    ogImageUrl: row.og_image_url ?? null,
    showOnHomepage: row.show_on_homepage ?? true,
    homepagePosition: row.homepage_position ?? null,
    homepageLabel: row.homepage_label ?? null,
    displayStyle: row.display_style === "portrait" ? "portrait" : "default",
    // Only carry non-empty content arrays; empty/null means "use static fallback".
    content: Array.isArray(row.content) && row.content.length > 0 ? row.content : undefined,
  };
}
