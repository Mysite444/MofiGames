export type IconName =
  | "Swords" | "Compass" | "Car" | "Truck" | "Bike" | "Trophy" | "CircleDot"
  | "Puzzle" | "LayoutGrid" | "Spade" | "Dices" | "Crosshair" | "Target"
  | "Skull" | "Ghost" | "Users" | "Gamepad2" | "Globe" | "MousePointerClick"
  | "Hourglass" | "Settings2" | "Blocks" | "Sprout" | "Shirt" | "ChefHat"
  | "SpellCheck2" | "CircleHelp" | "ParkingCircle" | "DoorOpen"
  | "PersonStanding" | "Castle" | "Music2" | "Flame" | "Sparkles" | "Flame2" | "Home"
  | "Joystick" | "Brain" | "RefreshCw" | "Zap";

export type Tag = "TOP" | "HOT" | "NEW" | "UPDATED" | null;

export interface Category {
  slug: string;
  name: string;
  icon: IconName;
  colorFrom: string;
  colorTo: string;
  description: string;
  /** Advanced SEO Module — Category SEO. All optional: a category that
   * hasn't had these set yet falls back to an auto-generated value. */
  seoTitle?: string;
  seoDescription?: string;
  seoCanonicalUrl?: string | null;
  seoFocusKeyword?: string;
  seoH1Title?: string;
  seoIndex?: boolean;
  breadcrumbsEnabled?: boolean;
  schemaCollectionPage?: boolean;
  ogImageUrl?: string | null;
  /** Homepage placement controls (Admin → Categories → Homepage Placement).
   * DB-backed real categories only; absent on code-defined placeholder
   * categories, which fall back to show_on_homepage=true and auto position. */
  showOnHomepage?: boolean;
  homepagePosition?: number | null;
  homepageLabel?: string | null;
  /** Long-form SEO body content shown in a collapsed "Show more" section
   * after the grid/pagination on the category page (CrazyGames-style genre
   * page copy — a few subheaded paragraphs). Optional: categories without
   * it (e.g. brand-new ones added via the admin) simply don't render the
   * section at all rather than showing an empty "Show more" button. */
  content?: CategoryContentBlock[];
  /**
   * Homepage card layout template.
   * - 'default'  → landscape 16:9 cards (202 × 114 px) — same as every
   *                existing genre row today. The CategoryRow `variant` is
   *                left as undefined, which defaults to 'default'.
   * - 'portrait' → tall 2:3 portrait cards (202 × 304 px) — same style
   *                as the MofiGames Originals row. Maps to CategoryRow
   *                `variant="originals"`. Also uses PortraitCard on mobile.
   *
   * Absent (undefined) means 'default' — safe to treat as falsy.
   */
  displayStyle?: "default" | "portrait";
}

export interface CategoryContentBlock {
  heading: string;
  body: string;
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  categorySlug: string;
  variant: number;
  tag: Tag;
  rating: number;
  ratingCount?: number;
  plays: number;
  favoriteCount?: number;
  multiplayer: boolean;
  /** May be unset for a game that hasn't had artwork uploaded yet. When
   * present, the game page renders an actual iframe/thumbnail instead of
   * the gradient placeholder. */
  thumbnailUrl?: string;
  coverImageUrl?: string;
  /** Longer trailer meant for deliberate viewing (e.g. a linked YouTube
   * video), as distinct from `previewVideoUrl` below. */
  videoTrailerUrl?: string;
  /** Short, silent, looping clip used for hover-preview on desktop game
   * cards and the autoplay background loop on the mobile game page hero —
   * the CrazyGames-style "preview video" behavior. */
  previewVideoUrl?: string;
  loadingScreenUrl?: string;
  estimatedLoadingSeconds?: number | null;
  playUrl?: string;
  description?: string;
  instructions?: string;
  /** Free-text controls list, one control per line (e.g. "WASD = move"). */
  controls?: string;
  developer?: string;
  publisher?: string;
  releaseDate?: string | null;
  version?: string;
  mobileSupport?: boolean;
  fullscreenEnabled?: boolean;
  /** When true (default), the Save Progress button is shown in the player
   *  action bar. Set false for embed games that manage their own save system. */
  saveProgressEnabled?: boolean;
  width?: number | null;
  height?: number | null;
  orientation?: "landscape" | "portrait";
  visibility?: "public" | "private" | "unlisted";
  metaTitle?: string;
  metaDescription?: string;
  /** Advanced SEO Module — Game Page SEO. All optional/best-effort: a
   * game that hasn't had these set falls back to an auto-generated
   * value — see src/lib/seo.ts. */
  seoCanonicalUrl?: string | null;
  seoFocusKeyword?: string;
  seoSecondaryKeywords?: string[];
  seoH1Title?: string;
  seoExcerpt?: string;
  seoAuthor?: string;
  seoIndex?: boolean;
  seoFollow?: boolean;
  seoMaxSnippet?: number;
  seoMaxImagePreview?: "none" | "standard" | "large";
  seoMaxVideoPreview?: number;
  seoNoarchive?: boolean;
  seoNosnippet?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string | null;
  /** Homepage placement controls (Admin → Categories → Homepage Placement).
   * DB-backed real categories only; absent on code-defined placeholder
   * categories, which fall back to show_on_homepage=true and auto position. */
  showOnHomepage?: boolean;
  homepagePosition?: number | null;
  homepageLabel?: string | null;
  ogImageAlt?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImageUrl?: string | null;
  twitterImageAlt?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  schemaVideoGame?: boolean;
  schemaSoftwareApplication?: boolean;
  schemaReview?: boolean;
  schemaBreadcrumb?: boolean;
  createdAt?: string;
  updatedAt?: string;
  tagIds?: string[];
  /** Homepage manager (admin panel → Homepage) — real games only. A game
   * can be in any combination of these three collections at once. The
   * `*Order` fields control left-to-right position within that collection
   * (lower first); admin-set via drag-free up/down reordering. */
  isFeatured?: boolean;
  featuredOrder?: number | null;
  isTrending?: boolean;
  isRecommended?: boolean;
  isEditorsPick?: boolean;
  editorsPickOrder?: number | null;
  isSponsored?: boolean;
  sponsoredOrder?: number | null;
  /** Optional small label shown on a sponsored game's badge, e.g. a
   * sponsor's name. Falls back to the plain word "Sponsored" when empty. */
  sponsorLabel?: string | null;
}

// ---------------------------------------------------------------------------
// Advanced SEO Module — site-wide settings & redirects (Admin → SEO
// Management). See supabase/migrations/0010_advanced_seo.sql.
// ---------------------------------------------------------------------------

export type CanonicalDomain = "www" | "non-www";
export type TrailingSlashMode = "add" | "remove" | "ignore";
export type TwitterCardType = "summary" | "summary_large_image" | "app" | "player";

export interface SeoSettings {
  siteName: string;
  titleTemplate: string;
  defaultMetaDescription: string;
  defaultAuthor: string;
  defaultLanguage: string;
  defaultRegion: string;
  defaultRobotsIndex: boolean;
  defaultRobotsFollow: boolean;
  canonicalDomain: CanonicalDomain;
  trailingSlash: TrailingSlashMode;

  googleSiteVerification: string;
  bingSiteVerification: string;
  yandexSiteVerification: string;
  baiduSiteVerification: string;

  homeSeoTitle: string;
  homeMetaDescription: string;
  homeOgImageUrl: string | null;

  defaultOgImageUrl: string | null;
  defaultOgImageAlt: string;
  twitterSite: string;
  twitterCreator: string;
  twitterCardType: TwitterCardType;

  orgName: string;
  orgLogoUrl: string | null;
  orgSameAs: string[];

  robotsTxtOverride: string | null;

  sitemapGamesEnabled: boolean;
  sitemapCategoriesEnabled: boolean;
  sitemapTagsEnabled: boolean;
  sitemapBlogEnabled: boolean;
  sitemapPagesEnabled: boolean;
  sitemapImagesEnabled: boolean;

  indexGames: boolean;
  indexCategories: boolean;
  indexTags: boolean;
  indexBlog: boolean;
  indexPages: boolean;
  indexSearchPages: boolean;
  indexAuthorPages: boolean;

  updatedAt: string;
}

/** Per-page SEO Analysis result (Admin → SEO Management → SEO Analysis).
 * Computed on the fly server-side — nothing here is persisted. */
export interface SeoAnalysisIssue {
  severity: "error" | "warning" | "info";
  message: string;
}

export interface SeoAnalysisResult {
  itemType: "game" | "category" | "tag" | "post" | "page";
  id: string;
  title: string;
  url: string;
  score: number;
  issues: SeoAnalysisIssue[];
  wordCount: number;
  titleLength: number;
  descriptionLength: number;
}
