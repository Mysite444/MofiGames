import { z } from "zod";
import { ICON_NAMES } from "./icon-map";
import { sanitizePlainText, sanitizeSingleLineText } from "./sanitize-text";

// Shared request-body schemas for src/app/api/**. Kept in one place so the
// API routes and (where useful) the client code that calls them agree on
// exactly what's valid — the routes are the enforcement point, this file is
// just where the rules live.

const uuid = z.string().uuid();
const slug = z
  .string()
  .trim()
  .min(1, "Required")
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only");

// --- Comments ---------------------------------------------------------

export const createCommentSchema = z.object({
  gameSlug: z.string().trim().min(1).max(80),
  parentId: uuid.nullable().optional(),
  body: z
    .string()
    .trim()
    .min(1, "Comment can't be empty")
    .max(2000, "Comments are limited to 2000 characters")
    // XSS hardening: strip markup/control characters before this ever
    // reaches the database — see src/lib/sanitize-text.ts. React already
    // escapes comment text on render; this is defense-in-depth.
    .transform((v) => sanitizePlainText(v))
    .refine((v) => v.length > 0, "Comment can't be empty"),
});

// --- Account / Profile (self-service) --------------------------------------
// Username + bio are the two other plain-text fields a regular (non-admin)
// visitor controls that get shown to other people — same XSS-hardening
// treatment as comments: length-capped, then run through sanitizePlainText
// (or sanitizeSingleLineText for the single-line name) before being stored.
// Enforced here, server-side, in src/app/api/account/profile/route.ts —
// previously `name` was written straight from the browser to Supabase with
// no server-side validation at all (see AuthContext.updateProfile).

const displayNameField = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters.")
  .max(40, "Name is too long (max 40 characters).")
  .transform((v) => sanitizeSingleLineText(v))
  .refine((v) => v.length >= 2, { message: "Name must be at least 2 characters." });

const bioField = z
  .string()
  .trim()
  .max(300, "Bio is too long (max 300 characters).")
  .transform((v) => sanitizePlainText(v));

export const updateProfileSchema = z
  .object({
    name: displayNameField.optional(),
    bio: bioField.optional(),
  })
  .refine((v) => v.name !== undefined || v.bio !== undefined, {
    message: "Nothing to update.",
  });

// --- Games (admin) ------------------------------------------------------

const playTypeSchema = z.enum(["embed", "upload"]);
const tagSchema = z.enum(["TOP", "HOT", "NEW", "UPDATED"]).nullable();
const orientationSchema = z.enum(["landscape", "portrait"]);
const visibilitySchema = z.enum(["public", "private", "unlisted"]);
const optionalUrl = z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null));

export const gameInputSchema = z
  .object({
    slug,
    title: z.string().trim().min(1, "Title is required").max(120),
    description: z.string().trim().max(4000).default(""),
    instructions: z.string().trim().max(4000).default(""),
    // Sanitized HTML from the admin's RichTextEditor (headings/paragraphs/
    // lists) — the "arranged content" section. Larger cap than the plain
    // text fields above since markup adds overhead for the same amount of
    // reader-visible copy; sanitizeContentHtml() strips scripts/handlers
    // server-side before it's ever rendered.
    content: z.string().trim().max(20000).default(""),
    controls: z.string().trim().max(4000).default(""),

    category_slug: z.string().trim().min(1, "Category is required"),
    tagIds: z.array(uuid).max(30).default([]),

    developer: z.string().trim().max(120).default(""),
    publisher: z.string().trim().max(120).default(""),
    release_date: z.string().trim().max(10).nullable().optional().or(z.literal("").transform(() => null)),
    version: z.string().trim().max(40).default(""),

    thumbnail_url: optionalUrl,
    cover_image_url: optionalUrl,
    landscape_cover_url: optionalUrl,
    square_cover_url: optionalUrl,
    portrait_cover_url: optionalUrl,
    video_trailer_url: optionalUrl,
    preview_video_url: optionalUrl,
    loading_screen_url: optionalUrl,
    estimated_loading_seconds: z.number().int().min(0).max(600).nullable().optional(),

    play_type: playTypeSchema,
    embed_url: optionalUrl,
    storage_path: z.string().trim().nullable().optional(),

    tag: tagSchema.optional(),
    rating: z.number().min(0).max(5),
    plays: z.number().int().min(0).optional(),

    multiplayer: z.boolean(),
    mobile_support: z.boolean().default(true),
    fullscreen_enabled: z.boolean().default(true),
    save_progress_enabled: z.boolean().default(true),
    width: z.number().int().min(1).max(10000).nullable().optional(),
    height: z.number().int().min(1).max(10000).nullable().optional(),
    orientation: orientationSchema.default("landscape"),

    is_published: z.boolean(),
    scheduled_publish_at: z.string().trim().nullable().optional().or(z.literal("").transform(() => null)),
    visibility: visibilitySchema.default("public"),
    is_featured: z.boolean().optional(),
    featured_order: z.number().int().min(0).max(100000).nullable().optional(),
    is_trending: z.boolean().optional(),
    is_recommended: z.boolean().optional(),
    is_editors_pick: z.boolean().optional(),
    editors_pick_order: z.number().int().min(0).max(100000).nullable().optional(),
    is_sponsored: z.boolean().optional(),
    sponsored_order: z.number().int().min(0).max(100000).nullable().optional(),
    sponsor_label: z.string().trim().max(60).nullable().optional().or(z.literal("").transform(() => null)),

    meta_title: z.string().trim().max(70).default(""),
    meta_description: z.string().trim().max(300).default(""),

    // Advanced SEO Module — Game Page SEO
    seo_canonical_url: optionalUrl,
    seo_focus_keyword: z.string().trim().max(80).default(""),
    seo_secondary_keywords: z.array(z.string().trim().max(80)).max(20).default([]),
    seo_h1_title: z.string().trim().max(120).default(""),
    seo_excerpt: z.string().trim().max(300).default(""),
    seo_author: z.string().trim().max(120).default(""),
    seo_index: z.boolean().default(true),
    seo_follow: z.boolean().default(true),
    seo_max_snippet: z.number().int().min(-1).max(2000).default(-1),
    seo_max_image_preview: z.enum(["none", "standard", "large"]).default("large"),
    seo_max_video_preview: z.number().int().min(-1).max(2000).default(-1),
    seo_noarchive: z.boolean().default(false),
    seo_nosnippet: z.boolean().default(false),
    og_title: z.string().trim().max(95).default(""),
    og_description: z.string().trim().max(300).default(""),
    og_image_url: optionalUrl,
    og_image_alt: z.string().trim().max(150).default(""),
    twitter_title: z.string().trim().max(70).default(""),
    twitter_description: z.string().trim().max(200).default(""),
    twitter_image_url: optionalUrl,
    twitter_image_alt: z.string().trim().max(150).default(""),
    twitter_card: z.enum(["summary", "summary_large_image", "app", "player"]).default("summary_large_image"),
    schema_video_game: z.boolean().default(true),
    schema_software_application: z.boolean().default(true),
    schema_review: z.boolean().default(false),
    schema_breadcrumb: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.play_type === "embed" && !data.embed_url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Embed URL is required when play type is 'embed'",
        path: ["embed_url"],
      });
    }
    if (data.play_type === "upload" && !data.storage_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A storage path is required when play type is 'upload'",
        path: ["storage_path"],
      });
    }
  });

export const gameUpdateSchema = gameInputSchema.innerType().partial().superRefine((data, ctx) => {
  // The admin panel always PATCHes the full form (not a sparse patch), so
  // this mirrors gameInputSchema's rule whenever play_type is actually
  // part of the request — but doesn't demand it for a true partial update
  // (e.g. an update that only flips is_published) that never touches
  // play_type/embed_url/storage_path at all.
  if (data.play_type === undefined) return;
  if (data.play_type === "embed" && !data.embed_url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Embed URL is required when play type is 'embed'",
      path: ["embed_url"],
    });
  }
  if (data.play_type === "upload" && !data.storage_path) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A storage path is required when play type is 'upload'",
      path: ["storage_path"],
    });
  }
});

// --- Games (admin) — list query, bulk actions, duplicate -------------------
// Backs GET /api/admin/games (search/filter/sort/pagination — Phase 1/2 of
// the Game Management CMS upgrade) and POST /api/admin/games/bulk. Mirrors
// the shape of listUsersAdminQuerySchema below (same page/q/status
// convention) so the two admin list screens behave consistently.

export const listGamesAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  // "all" excludes trash (the default working view); "trash" is its own
  // explicit tab, same as every other CMS trash view — trashed games never
  // show up mixed into "all"/"published"/"draft"/"scheduled".
  status: z.enum(["all", "published", "draft", "scheduled", "trash"]).default("all"),
  category: z.string().trim().max(80).optional(),
  tag: uuid.optional(),
  featured: z.enum(["true", "false"]).optional(),
  trending: z.enum(["true", "false"]).optional(),
  multiplayer: z.enum(["true", "false"]).optional(),
  mobile: z.enum(["true", "false"]).optional(),
  // Only metrics that actually exist as columns on `games` — no invented
  // "most viewed" separate from "most played" (there is only one plays
  // counter; see games.plays, migration 0003).
  sort: z
    .enum(["newest", "oldest", "updated", "title_asc", "title_desc", "most_played", "published_date"])
    .default("newest"),
});

const gamesBulkActionEnum = z.enum([
  "publish",
  "draft",
  "unpublish",
  "trash",
  "restore",
  "delete_permanent",
  "assign_category",
  "add_tags",
  "remove_tags",
  "set_featured",
  "remove_featured",
  "set_trending",
  "remove_trending",
]);
export type GamesBulkAction = z.infer<typeof gamesBulkActionEnum>;

export const gamesBulkActionSchema = z
  .object({
    action: gamesBulkActionEnum,
    ids: z.array(uuid).min(1, "Select at least one game.").max(500, "Select 500 games or fewer at a time."),
    categorySlug: z.string().trim().min(1).max(80).optional(),
    tagIds: z.array(uuid).max(30).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "assign_category" && !data.categorySlug) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose a category to assign.", path: ["categorySlug"] });
    }
    if ((data.action === "add_tags" || data.action === "remove_tags") && (!data.tagIds || data.tagIds.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose at least one tag.", path: ["tagIds"] });
    }
  });

export const duplicateGameSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
});

// --- Content Management: Tags ---------------------------------------------

export const tagInputSchema = z.object({
  slug,
  name: z.string().trim().min(1, "Name is required").max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #ffd60a"),
  seo_title: z.string().trim().max(70).default(""),
  seo_description: z.string().trim().max(300).default(""),
  seo_canonical_url: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  seo_h1_title: z.string().trim().max(120).default(""),
  seo_index: z.boolean().default(true),
});
export const tagUpdateSchema = tagInputSchema.partial();

// --- Content Management: Pages ---------------------------------------------

export const pageInputSchema = z.object({
  slug,
  title: z.string().trim().min(1, "Title is required").max(120),
  content: z.string().max(200000).default(""),
  meta_description: z.string().trim().max(300).default(""),
  show_in_nav: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10000).default(0),
  is_published: z.boolean().default(true),
  seo_title: z.string().trim().max(70).default(""),
  seo_canonical_url: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  seo_h1_title: z.string().trim().max(120).default(""),
  seo_index: z.boolean().default(true),
  og_image_url: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
});
export const pageUpdateSchema = pageInputSchema.partial();

// --- Content Management: Posts (Blog/News) ----------------------------------

export const postInputSchema = z.object({
  slug,
  title: z.string().trim().min(1, "Title is required").max(160),
  excerpt: z.string().trim().max(500).default(""),
  content: z.string().max(200000).default(""),
  cover_image_url: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  author_name: z.string().trim().max(80).default("MofiGames Team"),
  is_published: z.boolean().default(false),
  published_at: z.string().datetime().optional(),
  // Scheduling (migration 0070) — null means not scheduled.
  scheduled_publish_at: z.string().datetime().nullable().optional(),
  tagIds: z.array(uuid).max(20).default([]),
  seo_title: z.string().trim().max(70).default(""),
  seo_description: z.string().trim().max(300).default(""),
  seo_canonical_url: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  seo_focus_keyword: z.string().trim().max(80).default(""),
  seo_secondary_keywords: z.array(z.string().trim().max(80)).max(20).default([]),
  seo_h1_title: z.string().trim().max(160).default(""),
  seo_index: z.boolean().default(true),
  og_title: z.string().trim().max(95).default(""),
  og_description: z.string().trim().max(300).default(""),
  og_image_url: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  og_image_alt: z.string().trim().max(150).default(""),
  twitter_card: z.enum(["summary", "summary_large_image", "app", "player"]).default("summary_large_image"),
  // Twitter-specific SEO fields
  twitter_title: z.string().trim().max(95).default(""),
  twitter_description: z.string().trim().max(300).default(""),
  twitter_image_url: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  twitter_image_alt: z.string().trim().max(150).default(""),
});
export const postUpdateSchema = postInputSchema.partial();

// --- Posts admin list query (pagination / search / filter / sort) -----------

export const listPostsAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  status: z.enum(["all", "published", "draft", "scheduled", "trash"]).default("all"),
  tag: uuid.optional(),
  sort: z
    .enum(["newest", "oldest", "updated", "title_asc", "title_desc", "published_date"])
    .default("newest"),
});

// --- Posts bulk actions (Phase 2 bulk toolbar) ------------------------------

const postsBulkActionEnum = z.enum([
  "publish",
  "draft",
  "trash",
  "restore",
  "delete_permanent",
  "add_tags",
  "remove_tags",
]);
export type PostsBulkAction = z.infer<typeof postsBulkActionEnum>;

export const postsBulkActionSchema = z
  .object({
    action: postsBulkActionEnum,
    ids: z.array(uuid).min(1, "Select at least one post.").max(500, "Select 500 posts or fewer at a time."),
    tagIds: z.array(uuid).max(30).optional(),
  })
  .superRefine((data, ctx) => {
    if ((data.action === "add_tags" || data.action === "remove_tags") && (!data.tagIds || data.tagIds.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose at least one tag.", path: ["tagIds"] });
    }
  });

export const duplicatePostSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
});

// --- Categories reorder -----------------------------------------------------

export const categoriesReorderSchema = z.object({
  // Ordered array of slugs — the new sort_order is each slug's index * 10.
  slugs: z.array(z.string().trim().min(1).max(80)).min(1).max(200),
});

// --- Tags bulk delete -------------------------------------------------------

export const tagsBulkDeleteSchema = z.object({
  ids: z.array(uuid).min(1, "Select at least one tag.").max(500),
});

// --- Homepage manager (admin) ----------------------------------------------

export const homepageSectionSchema = z.enum(["featured", "editors_pick", "sponsored"]);

export const homepageReorderSchema = z.object({
  section: homepageSectionSchema,
  gameIds: z.array(uuid).max(200),
});

// --- Categories (admin) ---------------------------------------------------

export const categoryInputSchema = z.object({
  slug,
  name: z.string().trim().min(1, "Name is required").max(80),
  icon: z.enum(ICON_NAMES as [string, ...string[]], {
    errorMap: () => ({ message: "Pick a valid icon from the list." }),
  }),
  color_from: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #8b5cf6"),
  color_to: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #ec4899"),
  description: z.string().trim().max(2000).default(""),
  sort_order: z.number().int().min(0).max(10000).default(0),

  // Advanced SEO Module — Category SEO
  seo_title: z.string().trim().max(70).default(""),
  seo_description: z.string().trim().max(300).default(""),
  seo_canonical_url: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),
  seo_focus_keyword: z.string().trim().max(80).default(""),
  seo_h1_title: z.string().trim().max(120).default(""),
  seo_index: z.boolean().default(true),
  breadcrumbs_enabled: z.boolean().default(true),
  schema_collection_page: z.boolean().default(true),
  og_image_url: z.string().trim().url().nullable().optional().or(z.literal("").transform(() => null)),

  // Homepage Placement (Admin → Categories → Homepage Placement)
  show_on_homepage: z.boolean().default(true),
  homepage_position: z.number().int().min(1).max(9999).nullable().optional(),
  homepage_label: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  // Display template — determines card shape on the homepage row and mobile
  // (migration 0066): 'default' = landscape 16:9, 'portrait' = tall 2:3
  display_style: z.enum(["default", "portrait"]).default("default"),
});

export const categoryUpdateSchema = categoryInputSchema.partial();

// --- Homepage Categories Manager (admin) -----------------------------------
// Covers the 25 registry rows (7 system-curated + 18 built-in genres) from
// src/lib/homepage-section-registry.ts, plus manual game pins which also
// accept "category:<slug>" for real DB categories.

const registrySectionKey = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^(system|genre):[a-z0-9_-]+$/, "Unrecognized homepage section.");

const anySectionKey = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^(system|genre|category):[a-z0-9_-]+$/, "Unrecognized homepage section.");

export const homepageSectionUpdateSchema = z
  .object({
    label: z
      .string()
      .trim()
      .max(80)
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    position: z.number().int().min(0).max(999999).optional(),
    is_visible: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });

export const homepageSectionKeyParamSchema = z.object({ key: registrySectionKey });

export const homepageSectionGamePinSchema = z.object({
  section_key: anySectionKey,
  game_id: uuid,
});

export const homepageSectionGamesReorderSchema = z.object({
  section_key: anySectionKey,
  gameIds: z.array(uuid).max(200),
});

// --- Play tracking --------------------------------------------------------

export const playParamsSchema = z.object({
  slug: z.string().trim().min(1).max(80),
});

// --- Ratings ---------------------------------------------------------------

export const rateGameSchema = z.object({
  rating: z.number().int().min(1, "Pick 1-5 stars").max(5, "Pick 1-5 stars"),
});

// --- Game Reviews ------------------------------------------------------
// Public 1-5 star rating + short write-up, one per (user, game) — separate
// from the rating above, which is private/self-only and has no text (see
// game_ratings, migration 0008). Reviews are meant to be publicly
// readable, like comments, so reviewText gets the same XSS-hardening
// treatment: length-capped, then sanitized (src/lib/sanitize-text.ts)
// before ever reaching the database.

export const createReviewSchema = z.object({
  rating: z.number().int().min(1, "Pick 1-5 stars.").max(5, "Pick 1-5 stars."),
  reviewText: z
    .string()
    .trim()
    .min(1, "Review can't be empty.")
    .max(1000, "Reviews are limited to 1000 characters.")
    .transform((v) => sanitizePlainText(v))
    .refine((v) => v.length > 0, "Review can't be empty."),
});

// --- Comment moderation (admin) -------------------------------------------

export const listCommentsAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  gameSlug: z.string().trim().max(80).optional(),
  q: z.string().trim().max(200).optional(),
});

export const listReviewsAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  gameSlug: z.string().trim().max(80).optional(),
  q: z.string().trim().max(200).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  maxRating: z.coerce.number().int().min(1).max(5).optional(),
});

// --- Mobile menu featured games (admin) -----------------------------------

export const mobileMenuGameSchema = z.object({
  game_id: uuid,
});

export const mobileMenuGamesReorderSchema = z.object({
  gameIds: z.array(uuid).max(50, "Maximum 50 games in the mobile menu."),
});

/** Formats the first zod issue into a short, user-facing message. */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request.";
  return issue.message;
}

// --- SEO Management (admin) -------------------------------------------------

const httpUrlOrNull = z
  .string()
  .trim()
  .url()
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const seoSettingsUpdateSchema = z.object({
  site_name: z.string().trim().min(1).max(80).optional(),
  title_template: z.string().trim().min(1).max(160).optional(),
  default_meta_description: z.string().trim().max(300).optional(),
  default_author: z.string().trim().max(120).optional(),
  default_language: z.string().trim().max(10).optional(),
  default_region: z.string().trim().max(10).optional(),
  default_robots_index: z.boolean().optional(),
  default_robots_follow: z.boolean().optional(),
  canonical_domain: z.enum(["www", "non-www"]).optional(),
  trailing_slash: z.enum(["add", "remove", "ignore"]).optional(),

  google_site_verification: z.string().trim().max(200).optional(),
  bing_site_verification: z.string().trim().max(200).optional(),
  yandex_site_verification: z.string().trim().max(200).optional(),
  baidu_site_verification: z.string().trim().max(200).optional(),

  home_seo_title: z.string().trim().max(70).optional(),
  home_meta_description: z.string().trim().max(300).optional(),
  home_og_image_url: httpUrlOrNull,

  default_og_image_url: httpUrlOrNull,
  default_og_image_alt: z.string().trim().max(150).optional(),
  twitter_site: z.string().trim().max(40).optional(),
  twitter_creator: z.string().trim().max(40).optional(),
  twitter_card_type: z.enum(["summary", "summary_large_image", "app", "player"]).optional(),

  org_name: z.string().trim().max(120).optional(),
  org_logo_url: httpUrlOrNull,
  org_same_as: z.array(z.string().trim().url()).max(20).optional(),

  robots_txt_override: z.string().max(20000).nullable().optional(),

  sitemap_games_enabled: z.boolean().optional(),
  sitemap_categories_enabled: z.boolean().optional(),
  sitemap_tags_enabled: z.boolean().optional(),
  sitemap_blog_enabled: z.boolean().optional(),
  sitemap_pages_enabled: z.boolean().optional(),
  sitemap_images_enabled: z.boolean().optional(),

  index_games: z.boolean().optional(),
  index_categories: z.boolean().optional(),
  index_tags: z.boolean().optional(),
  index_blog: z.boolean().optional(),
  index_pages: z.boolean().optional(),
  index_search_pages: z.boolean().optional(),
  index_author_pages: z.boolean().optional(),
});

const pathLike = z
  .string()
  .trim()
  .min(1, "Required")
  .max(2000)
  .regex(/^\//, "Must start with /")
  .regex(/^[^\s]+$/, "No spaces allowed");

export const redirectInputSchema = z
  .object({
    source_path: pathLike,
    destination_path: z.string().trim().max(2000).nullable().optional(),
    redirect_type: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308), z.literal(410)]),
    is_active: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.redirect_type !== 410 && !data.destination_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A destination is required unless this is a 410 Gone.",
        path: ["destination_path"],
      });
    }
    if (data.destination_path && data.source_path === data.destination_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Source and destination can't be the same path (redirect loop).",
        path: ["destination_path"],
      });
    }
  });
export const redirectUpdateSchema = redirectInputSchema.innerType().partial();

// --- AI SEO Assistant (admin) -----------------------------------------------

export const aiSeoGenerateSchema = z.object({
  itemType: z.enum(["game", "category", "post"]),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(""),
  category: z.string().trim().max(80).optional(),
  fields: z
    .array(
      z.enum([
        "seo_title",
        "meta_description",
        "focus_keyword",
        "secondary_keywords",
        "seo_excerpt",
        "og_title",
        "og_description",
        "twitter_title",
        "twitter_description",
      ])
    )
    .min(1)
    .max(9),
});

// --- Analytics ---------------------------------------------------------

export const recordPageViewSchema = z.object({
  path: z.string().trim().min(1).max(500),
  referrer: z.string().trim().max(500).optional().default(""),
  visitorId: z.string().trim().min(8).max(80),
});

export const recordSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
  resultsCount: z.number().int().min(0).max(100000).default(0),
});

export const analyticsSettingsUpdateSchema = z.object({
  ga4_measurement_id: z.string().trim().max(40).optional(),
  ga4_property_id: z.string().trim().max(40).optional(),
  gsc_site_url: z.string().trim().max(300).optional(),
  clarity_project_id: z.string().trim().max(40).optional(),
});
// --- User Management -----------------------------------------------------

const ROLE_VALUES = ["user", "moderator", "editor", "admin"] as const;
const PERMISSION_VALUES = [
  "ban_users",
  "verify_users",
  "manage_reports",
  "view_activity_logs",
  "moderate_comments",
  "manage_copyright",
] as const;

export const listUsersAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  q: z.string().trim().max(200).optional(),
  role: z.enum(ROLE_VALUES).optional(),
  status: z.enum(["all", "banned", "verified", "unverified"]).default("all"),
});

export const updateUserRoleSchema = z.object({
  role: z.enum(ROLE_VALUES),
});

export const banUserSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  expiresInDays: z.number().int().min(1).max(3650).optional(), // omitted = permanent
});

export const fileReportSchema = z.object({
  reportedUserId: z.string().uuid(),
  reason: z.enum(["spam", "harassment", "inappropriate_content", "impersonation", "other"]),
  details: z.string().trim().max(2000).optional().default(""),
  contextGameSlug: z.string().trim().max(80).optional(),
  contextCommentId: z.string().uuid().optional(),
});

const REPORT_KIND_VALUES = ["user", "copyright", "dmca", "counter_notice"] as const;
const REPORT_STATUS_VALUES = ["pending", "reviewed", "resolved", "dismissed"] as const;
const REPORT_PRIORITY_VALUES = ["low", "normal", "high", "urgent"] as const;
const REPORT_ACTION_TYPE_VALUES = ["warning", "remove_content", "suspend_user", "ban_user"] as const;

export const listReportsAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  // "open"/"closed" are virtual groupings (Report Queue = open, Report
  // History = closed) resolved server-side into an .in() over the real
  // enum below, alongside the individual statuses for fine-grained
  // filtering within either screen.
  status: z.enum(["all", "open", "closed", ...REPORT_STATUS_VALUES]).default("all"),
  // "copyright_all" is a virtual grouping (any of copyright/dmca/
  // counter_notice) resolved server-side into an .in(), used by Copyright
  // Claim History which spans all three copyright-ish kinds at once.
  kind: z.enum(["all", "copyright_all", ...REPORT_KIND_VALUES]).default("all"),
  reason: z.string().trim().max(50).optional(),
  categoryKey: z.string().trim().max(80).optional(),
  assignedTo: z.union([z.string().uuid(), z.literal("unassigned")]).optional(),
  q: z.string().trim().max(200).optional(),
});

export const updateReportSchema = z.object({
  status: z.enum(REPORT_STATUS_VALUES).optional(),
  assignedModeratorId: z.union([z.string().uuid(), z.null()]).optional(),
  priority: z.enum(REPORT_PRIORITY_VALUES).optional(),
  categoryKey: z.union([z.string().trim().max(80), z.null()]).optional(),
});

// Admin-logged report/case — covers manually recorded abuse reports as
// well as copyright/DMCA/counter-notice claims taken by phone/email.
export const createReportAdminSchema = z
  .object({
    kind: z.enum(REPORT_KIND_VALUES).default("user"),
    reason: z.enum(["spam", "harassment", "inappropriate_content", "impersonation", "other"]).optional(),
    reportedUserId: z.string().uuid().optional(),
    details: z.string().trim().max(2000).optional().default(""),
    contextGameSlug: z.string().trim().max(80).optional(),
    contextCommentId: z.string().uuid().optional(),
    categoryKey: z.string().trim().max(80).optional(),
    priority: z.enum(REPORT_PRIORITY_VALUES).optional().default("normal"),
    claimantName: z.string().trim().max(200).optional(),
    claimantEmail: z.string().trim().email().max(200).optional(),
    copyrightedWorkDescription: z.string().trim().max(4000).optional(),
    infringingUrl: z.string().trim().max(2000).optional(),
    swornStatement: z.boolean().optional().default(false),
    relatedReportId: z.string().uuid().optional(),
  })
  .refine((v) => v.kind !== "user" || Boolean(v.reason), {
    message: "A reason is required for a user report.",
    path: ["reason"],
  })
  .refine((v) => v.kind === "user" || Boolean(v.claimantName), {
    message: "A claimant name is required for copyright/DMCA claims.",
    path: ["claimantName"],
  });

// Public copyright/DMCA/counter-notice submission — no account required.
export const fileCopyrightClaimSchema = z.object({
  kind: z.enum(["copyright", "dmca", "counter_notice"]),
  claimantName: z.string().trim().min(1).max(200),
  claimantEmail: z.string().trim().email().max(200),
  copyrightedWorkDescription: z.string().trim().min(1).max(4000),
  infringingUrl: z.string().trim().min(1).max(2000),
  details: z.string().trim().max(2000).optional().default(""),
  swornStatement: z.boolean(),
  relatedReportId: z.string().uuid().optional(),
});

export const createReportNoteSchema = z.object({
  note: z.string().trim().min(1).max(4000),
});

export const createReportActionSchema = z.object({
  actionType: z.enum(REPORT_ACTION_TYPE_VALUES),
  targetUserId: z.string().uuid().optional(),
  details: z.string().trim().max(2000).optional().default(""),
  banExpiresInDays: z.number().int().min(1).max(3650).optional(),
});

export const listReportCategoriesQuerySchema = z.object({
  group: z.enum(["all", "user", "copyright", "abuse"]).default("all"),
});

export const createReportCategorySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers, and underscores only."),
  label: z.string().trim().min(1).max(120),
  group: z.enum(["user", "copyright", "abuse"]),
  description: z.string().trim().max(500).optional().default(""),
  sortOrder: z.number().int().min(0).max(10000).optional().default(0),
});

export const updateReportCategorySchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
});

export const listAuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  reportId: z.string().uuid().optional(),
});

export const updateRolePermissionsSchema = z.object({
  role: z.enum(["moderator", "editor"]),
  permissions: z.array(z.enum(PERMISSION_VALUES)),
});

export const updateUserPermissionOverridesSchema = z.object({
  overrides: z.array(
    z.object({
      permission: z.enum(PERMISSION_VALUES),
      granted: z.boolean().nullable(), // null = remove the override, fall back to role default
    })
  ),
});

export const listActivityAdminQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  userId: z.string().uuid().optional(),
  activityType: z.string().trim().max(80).optional(),
});

// --- Localization (admin) ---------------------------------------------------

const localeCode = z
  .string()
  .trim()
  .min(2, "Required")
  .max(15)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/, "Use a locale code like \"en\" or \"pt-BR\".")
  .transform((s) => s.toLowerCase());

export const languageInputSchema = z.object({
  code: localeCode,
  name: z.string().trim().min(1).max(80),
  native_name: z.string().trim().max(80).optional().default(""),
  flag_emoji: z.string().trim().max(8).optional().default(""),
  is_rtl: z.boolean().optional().default(false),
  is_default: z.boolean().optional().default(false),
  is_enabled: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(10000).optional().default(0),
});
export const languageUpdateSchema = languageInputSchema.partial().omit({ code: true });

const currencyCode = z
  .string()
  .trim()
  .length(3, "Use a 3-letter ISO 4217 code like \"USD\".")
  .regex(/^[a-zA-Z]{3}$/, "Use a 3-letter ISO 4217 code like \"USD\".")
  .transform((s) => s.toUpperCase());

export const currencyInputSchema = z.object({
  code: currencyCode,
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().min(1).max(8),
  symbol_position: z.enum(["before", "after"]).optional().default("before"),
  decimal_separator: z.string().trim().min(1).max(1).optional().default("."),
  thousands_separator: z.string().trim().max(1).optional().default(","),
  decimal_places: z.number().int().min(0).max(6).optional().default(2),
  exchange_rate: z.number().positive().max(1_000_000).optional().default(1),
  exchange_rate_mode: z.enum(["automatic", "manual"]).optional().default("manual"),
  is_default: z.boolean().optional().default(false),
  is_enabled: z.boolean().optional().default(true),
  sort_order: z.number().int().min(0).max(10000).optional().default(0),
});
export const currencyUpdateSchema = currencyInputSchema.partial().omit({ code: true });

export const translationUpsertSchema = z.object({
  namespace: z.enum(["ui", "menu", "page", "email", "error"]),
  key: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9_.\-]+$/, "Keys may only contain letters, numbers, dots, dashes, and underscores."),
  language_code: localeCode,
  value: z.string().max(20000).optional().default(""),
});

export const listTranslationsQuerySchema = z.object({
  namespace: z.enum(["ui", "menu", "page", "email", "error"]).optional(),
  languageCode: z.string().trim().max(15).optional(),
  q: z.string().trim().max(200).optional(),
});

const regionListItem = z.object({
  country_code: z
    .string()
    .trim()
    .length(2, "Use a 2-letter ISO 3166-1 country code.")
    .transform((s) => s.toUpperCase()),
});

export const currencyByRegionSchema = regionListItem.extend({
  currency_code: currencyCode,
});

export const regionalContentRestrictionSchema = regionListItem.extend({
  restriction_type: z.enum(["block", "allow_only"]),
  note: z.string().trim().max(300).optional().default(""),
});

export const countryRedirectSchema = regionListItem.extend({
  redirect_path: z.string().trim().min(1).max(2000),
  is_active: z.boolean().optional().default(true),
});

export const localizationSettingsUpdateSchema = z.object({
  default_country: z.string().trim().length(2).optional(),
  default_region: z.string().trim().max(80).optional(),
  timezone: z.string().trim().max(80).optional(),
  date_format: z.string().trim().max(40).optional(),
  time_format: z.enum(["12h", "24h"]).optional(),
  number_format: z.string().trim().max(40).optional(),
  first_day_of_week: z.enum(["sunday", "monday", "saturday"]).optional(),
  measurement_units: z.enum(["metric", "imperial"]).optional(),

  language_switcher_style: z.enum(["dropdown", "flags", "list"]).optional(),
  language_switcher_enabled: z.boolean().optional(),

  auto_language_detection: z.boolean().optional(),
  auto_currency_detection: z.boolean().optional(),
  geo_ip_region_detection: z.boolean().optional(),

  currency_by_region: z.array(currencyByRegionSchema).max(300).optional(),
  regional_content_restrictions: z.array(regionalContentRestrictionSchema).max(300).optional(),
  country_redirects: z.array(countryRedirectSchema).max(300).optional(),
  regional_content_restrictions_enabled: z.boolean().optional(),
  country_redirects_enabled: z.boolean().optional(),
});

// --- Automation (admin) -------------------------------------------------

const cronExpression = z
  .string()
  .trim()
  .regex(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/, "Use a standard 5-field cron expression, e.g. \"0 * * * *\".");

export const automationJobUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  schedule_cron: cronExpression.optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const listAutomationRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  jobKey: z.string().trim().max(80).optional(),
  status: z.enum(["running", "success", "partial", "failed"]).optional(),
});

export const importProviderInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "Required")
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only"),
  feed_url: z.string().trim().url("Enter a valid feed URL."),
  field_map: z.record(z.string(), z.string()).optional().default({}),
  enabled: z.boolean().optional().default(true),
});
export const importProviderUpdateSchema = importProviderInputSchema.partial();

export const importRuleUpsertSchema = z.object({
  provider_id: z.string().uuid(),
  schedule_cron: cronExpression.nullable().optional(),
  auto_publish: z.boolean().optional().default(false),
  skip_duplicate_games: z.boolean().optional().default(true),
  auto_update_existing_games: z.boolean().optional().default(true),
  default_category_slug: z.string().trim().max(80).nullable().optional(),
  default_tag_ids: z.array(z.string().uuid()).max(30).optional().default([]),
  max_items_per_run: z.number().int().min(1).max(1000).optional().default(100),
  max_retries: z.number().int().min(0).max(10).optional().default(3),
});

export const runImportSchema = z.object({
  providerId: z.string().uuid(),
});

// --- Security (Admin → Security) ----------------------------------------

export const securitySettingsInputSchema = z.object({
  minPasswordLength: z.number().int().min(6).max(128).optional(),
  requireUppercase: z.boolean().optional(),
  requireLowercase: z.boolean().optional(),
  requireNumber: z.boolean().optional(),
  requireSymbol: z.boolean().optional(),
  maxFailedAttempts: z.number().int().min(3).max(20).optional(),
  lockoutWindowMinutes: z.number().int().min(1).max(1440).optional(),
  sessionTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  require2faForAdmins: z.boolean().optional(),
  apiCorsOrigins: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});

export const recordLoginAttemptSchema = z.object({
  email: z.string().trim().email().max(255),
  success: z.boolean(),
  failureReason: z.string().trim().max(200).optional(),
});

export const loginGuardQuerySchema = z.object({
  email: z.string().trim().email().max(255),
});

export const listLoginAttemptsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  email: z.string().trim().max(255).optional(),
  outcome: z.enum(["success", "failed"]).optional(),
});

export const listSecurityAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  resolved: z.coerce.boolean().optional(),
});

export const listAdminActionLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  action: z.string().trim().max(80).optional(),
  q: z.string().trim().max(200).optional(),
});

export const logSecurityAlertSchema = z.object({
  type: z.enum(["password_changed", "mfa_enabled", "mfa_disabled"]),
  message: z.string().trim().min(1).max(300),
});

export const resolveSecurityAlertSchema = z.object({
  resolved: z.boolean(),
});

export const createAccessRuleSchema = z
  .object({
    ruleType: z.enum(["ip", "country"]),
    mode: z.enum(["block", "allow"]),
    value: z.string().trim().min(1).max(64),
    reason: z.string().trim().max(300).optional(),
  })
  .refine(
    (data) =>
      data.ruleType === "country"
        ? /^[A-Za-z]{2}$/.test(data.value)
        : /^[0-9a-fA-F:.]+$/.test(data.value),
    { message: "Enter a valid IP address (for IP rules) or two-letter country code (for country rules).", path: ["value"] }
  )
  .transform((data) => ({ ...data, value: data.ruleType === "country" ? data.value.toUpperCase() : data.value }));

// --- API Security (Admin → Security → API Keys, /api/v1/*) ---------------

export const createApiKeySchema = z.object({
  label: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(["read:games", "read:categories"])).min(1),
  rateLimitPerHour: z.number().int().min(1).max(100000).default(1000),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export const listGamesV1QuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().trim().max(80).optional(),
});

export const restoreBackupSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  tables: z.array(z.enum(["games", "categories", "tags", "pages", "posts"])).min(1).optional(),
});

// --- Site Content Backup & Complete Site Migration (Admin → Backups) ---
// Table names are checked against the live registry (CONTENT_TABLES in
// src/lib/backup/content-tables.ts) with .refine() rather than a
// hardcoded z.enum(), so this validation can't silently drift out of
// sync with that registry.

const SAFE_STORAGE_KEY_RE = /^[\w.\-:/]+$/;

export const backupStorageKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(SAFE_STORAGE_KEY_RE, "Storage key contains disallowed characters.");

export const contentBackupExportOptionsSchema = z.object({
  tables: z.array(z.string().trim().min(1).max(100)).min(1).max(64).optional(),
});

export const contentBackupUploadRefSchema = z.object({
  storageKey: backupStorageKeySchema,
});

export const contentBackupRestoreSchema = z.object({
  storageKey: backupStorageKeySchema,
  tables: z.array(z.string().trim().min(1).max(100)).min(1).max(64).optional(),
  dryRun: z.boolean().optional(),
});

export const migrationExportOptionsSchema = z.object({
  includeStorageFiles: z.boolean().optional(),
});

export const migrationUploadRefSchema = z.object({
  storageKey: backupStorageKeySchema,
});

export const migrationRestoreSchema = z.object({
  storageKey: backupStorageKeySchema,
  tables: z.array(z.string().trim().min(1).max(100)).min(1).max(64).optional(),
  dryRun: z.boolean().optional(),
  createMissingBuckets: z.boolean().optional(),
});

// --- Site Settings: Site Identity (Admin → Site Settings → Site Identity) --

const httpUrlOrNullLoose = z
  .string()
  .trim()
  .url()
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const siteIdentityUpdateSchema = z.object({
  site_name: z.string().trim().min(1, "Site name is required").max(80).optional(),
  site_tagline: z.string().trim().max(200).optional(),
  logo_url: httpUrlOrNullLoose,
  // Full favicon / app-icon set (Admin → Site Settings → Site Identity).
  // favicon_url is the classic favicon.ico; the rest back the 16/32 PNGs,
  // the SVG, the Apple touch icon, and the two PWA manifest sizes.
  favicon_url: httpUrlOrNullLoose,
  favicon_16_url: httpUrlOrNullLoose,
  favicon_32_url: httpUrlOrNullLoose,
  favicon_svg_url: httpUrlOrNullLoose,
  apple_touch_icon_url: httpUrlOrNullLoose,
  icon_192_url: httpUrlOrNullLoose,
  icon_512_url: httpUrlOrNullLoose,
  copyright_text: z.string().trim().max(200).optional(),
});

// --- Site Settings: Menu Links (Admin → Site Settings → Menu Links) -------

export const menuLinkInputSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(60),
  url: z.string().trim().min(1, "URL is required").max(2000),
  open_in_new_tab: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(10000).default(0),
  is_active: z.boolean().default(true),
});
export const menuLinkUpdateSchema = menuLinkInputSchema.partial();

// --- Monetization: Advertisement Management (Admin → Monetization) --------
// Singleton settings row backing every ad placement the public site can
// render. Slot ids and custom code are freeform (network snippets vary
// wildly), so this schema is mostly about type/range safety, not format.

const adCodeLoose = z.string().trim().max(20000).nullable().optional().or(z.literal("").transform(() => null));
const adSlotIdLoose = z.string().trim().max(200).nullable().optional().or(z.literal("").transform(() => null));

export const adSettingsUpdateSchema = z.object({
  adsense_enabled: z.boolean().optional(),
  adsense_client_id: adSlotIdLoose,
  adsense_auto_ads: z.boolean().optional(),

  header_ads_enabled: z.boolean().optional(),
  header_ads_slot_id: adSlotIdLoose,
  header_ads_code: adCodeLoose,

  player_ads_enabled: z.boolean().optional(),
  player_ads_slot_id: adSlotIdLoose,
  player_ads_code: adCodeLoose,

  sidebar_ads_enabled: z.boolean().optional(),
  sidebar_ads_slot_id: adSlotIdLoose,
  sidebar_ads_code: adCodeLoose,

  ingame_ads_enabled: z.boolean().optional(),
  ingame_ads_slot_id: adSlotIdLoose,
  ingame_ads_code: adCodeLoose,
  ingame_ads_frequency: z.number().int().min(1).max(100).optional(),

  footer_ads_enabled: z.boolean().optional(),
  footer_ads_slot_id: adSlotIdLoose,
  footer_ads_code: adCodeLoose,

  sticky_ads_enabled: z.boolean().optional(),
  sticky_ads_slot_id: adSlotIdLoose,
  sticky_ads_code: adCodeLoose,
  sticky_ads_position: z.enum(["top", "bottom"]).optional(),
  sticky_ads_dismissible: z.boolean().optional(),

  reward_ads_enabled: z.boolean().optional(),
  reward_ads_slot_id: adSlotIdLoose,
  reward_ads_code: adCodeLoose,
  reward_ads_reward_label: z.string().trim().min(1).max(80).optional(),

  custom_html_ads_enabled: z.boolean().optional(),
  custom_html_ads_code: adCodeLoose,
});

// --- Monetization: Ad Protection (Admin → Monetization → Ad Protection) ---

export const adProtectionSettingsUpdateSchema = z.object({
  invalid_click_detection_enabled: z.boolean().optional(),

  click_frequency_limit_enabled: z.boolean().optional(),
  click_frequency_max: z.number().int().min(1).max(1000).optional(),
  click_frequency_window_seconds: z.number().int().min(5).max(86400).optional(),

  impression_frequency_limit_enabled: z.boolean().optional(),
  impression_frequency_max: z.number().int().min(1).max(5000).optional(),
  impression_frequency_window_seconds: z.number().int().min(5).max(86400).optional(),

  suspicious_user_detection_enabled: z.boolean().optional(),
  bot_detection_enabled: z.boolean().optional(),
  vpn_proxy_detection_enabled: z.boolean().optional(),
  datacenter_ip_detection_enabled: z.boolean().optional(),

  auto_ad_disable_enabled: z.boolean().optional(),
  auto_ad_disable_risk_threshold: z.number().int().min(1).max(100).optional(),

  auto_ip_blocking_enabled: z.boolean().optional(),
  auto_ip_blocking_risk_threshold: z.number().int().min(1).max(100).optional(),

  ctr_alert_threshold_pct: z.number().min(0).max(100).optional(),
});

export const adProtectionRuleInputSchema = z.object({
  targetType: z.enum(["ip", "visitor"]),
  mode: z.enum(["whitelist", "blacklist"]),
  value: z.string().trim().min(1, "Value is required").max(100),
  reason: z.string().trim().max(300).optional(),
});

// One ad slot's impression or click, reported by the public site (see
// src/lib/ad-tracking.ts). IP, device/browser/OS, and bot/VPN/datacenter
// signals are all derived server-side from the request itself — none of
// that is trusted from the client body.
export const recordAdEventSchema = z.object({
  eventType: z.enum(["impression", "click"]),
  placement: z.string().trim().min(1).max(40),
  path: z.string().trim().min(1).max(500),
  visitorId: z.string().trim().min(8).max(80),
  xPct: z.number().min(0).max(100).optional(),
  yPct: z.number().min(0).max(100).optional(),
});

// --- Cache (Admin → Cache → Browser Cache) -------------------------------
// Ranges mirror the CHECK constraints in migration 0033_cache_management.sql
// and CACHE_MAX_AGE_LIMITS in src/lib/cache-settings.ts — kept in sync by
// hand since one lives in SQL and the other in TS.

export const cacheSettingsInputSchema = z.object({
  contentImagesMaxAge: z.number().int().min(60).max(31536000).optional(),
  gameThumbnailsMaxAge: z.number().int().min(60).max(31536000).optional(),
  gameMediaMaxAge: z.number().int().min(60).max(31536000).optional(),
  mediaLibraryMaxAge: z.number().int().min(60).max(31536000).optional(),
  gameFilesMaxAge: z.number().int().min(60).max(604800).optional(),
  serviceWorkerEnabled: z.boolean().optional(),
  serviceWorkerCacheVersion: z.number().int().min(1).optional(),
});

// --- CDN / Edge Cache (Admin → Cache → CDN / Edge Cache) -----------------
// Ranges mirror the CHECK constraints in migration 0034_cdn_edge_cache.sql.
// apiToken is intentionally a plain optional string, not a "secret" type —
// blank/omitted means "leave the stored token unchanged"; clearCredentials
// is the only way to actually wipe zoneId/apiToken (see the settings route).

export const cdnCacheSettingsInputSchema = z.object({
  zoneId: z.string().trim().max(64).optional(),
  apiToken: z.string().trim().min(1).max(200).optional(),
  clearCredentials: z.boolean().optional(),
  edgeCachingEnabled: z.boolean().optional(),
  smartCacheRulesEnabled: z.boolean().optional(),
  cacheEverythingEnabled: z.boolean().optional(),
  cacheEverythingPaths: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  cacheByDeviceEnabled: z.boolean().optional(),
  cacheByQueryStringMode: z.enum(["ignore_all", "include_all", "include_list"]).optional(),
  cacheByQueryStringParams: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  imageCdnEnabled: z.boolean().optional(),
  brotliEnabled: z.boolean().optional(),
  http3Enabled: z.boolean().optional(),
  earlyHintsEnabled: z.boolean().optional(),
  edgeTtlSeconds: z.number().int().min(60).max(2592000).optional(),
});

// --- Full Page Cache (Admin → Cache → Full Page Cache) -------------------
// Ranges mirror the CHECK constraints in migration 0035_full_page_cache.sql.
// varnishPurgeKey blank/omitted = leave the stored key unchanged (same
// pattern as apiToken above). clearPurgeKey = true is the only way to wipe it.

const pathPattern = z.string().trim().min(1).max(200);
const cookiePattern = z.string().trim().min(1).max(200);

export const fullPageCacheSettingsInputSchema = z.object({
  provider: z.enum(["none", "litespeed", "nginx_fastcgi", "varnish", "cloudflare_apo", "static_html"]).optional(),

  // Shared behaviour
  guestCacheEnabled: z.boolean().optional(),
  guestCacheTtlSeconds: z.number().int().min(60).max(2592000).optional(),
  loggedInCacheEnabled: z.boolean().optional(),
  loggedInCachePaths: z.array(pathPattern).max(50).optional(),
  loggedInCacheTtlSeconds: z.number().int().min(60).max(86400).optional(),
  staticHtmlEnabled: z.boolean().optional(),
  staticHtmlOutputDir: z.string().trim().min(1).max(500).optional(),

  // Exclusions
  excludedPaths: z.array(pathPattern).max(100).optional(),
  bypassCookies: z.array(cookiePattern).max(50).optional(),
  bypassQueryParams: z.array(z.string().trim().min(1).max(100)).max(50).optional(),

  // LiteSpeed
  lsCacheTagPrefix: z.string().trim().min(1).max(32).optional(),
  lsEsiEnabled: z.boolean().optional(),
  lsObjectCacheEnabled: z.boolean().optional(),
  lsBrowserCacheTtlSeconds: z.number().int().min(60).max(2592000).optional(),

  // Nginx FastCGI
  nginxCachePath: z.string().trim().min(1).max(500).optional(),
  nginxCacheZoneName: z.string().trim().min(1).max(64).optional(),
  nginxCacheZoneSize: z.string().trim().min(1).max(16).optional(),
  nginxCacheMaxSize: z.string().trim().min(1).max(16).optional(),
  nginxCacheKey: z.string().trim().min(1).max(300).optional(),
  nginxCacheLock: z.boolean().optional(),
  nginxCacheUseStale: z.array(z.string().trim().min(1).max(50)).max(10).optional(),

  // Varnish
  varnishBackendHost: z.string().trim().min(1).max(255).optional(),
  varnishBackendPort: z.number().int().min(1).max(65535).optional(),
  varnishDefaultTtlSeconds: z.number().int().min(60).max(2592000).optional(),
  varnishGraceSeconds: z.number().int().min(0).max(86400).optional(),
  varnishPurgeKey: z.string().trim().min(1).max(256).optional(), // blank/omitted = unchanged
  clearPurgeKey: z.boolean().optional(),

  // Cloudflare APO
  cfApoEnabled: z.boolean().optional(),
  cfApoBypassCookies: z.array(cookiePattern).max(50).optional(),
  cfApoBypassPaths: z.array(pathPattern).max(50).optional(),
});

// --- Object Cache (Admin → Cache → Object Cache) --------------------------
// Ranges mirror the CHECK constraints in migration 0036_object_cache.sql.
// redisPassword/memcachedPassword blank/omitted = leave the stored secret
// unchanged (same pattern as varnishPurgeKey above); clearRedisPassword /
// clearMemcachedPassword are the only way to actually wipe them.

const cacheGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores, and hyphens only"),
  ttlSeconds: z.number().int().min(0).max(2592000),
  persistent: z.boolean(),
  global: z.boolean(),
});

export const objectCacheSettingsInputSchema = z.object({
  provider: z.enum(["none", "redis", "memcached", "wordpress_object_cache"]).optional(),

  // Shared behaviour
  persistentEnabled: z.boolean().optional(),
  defaultTtlSeconds: z.number().int().min(10).max(2592000).optional(),
  keyPrefix: z.string().trim().min(1).max(32).optional(),
  cacheGroups: z.array(cacheGroupSchema).max(50).optional(),

  // Redis
  redisHost: z.string().trim().min(1).max(255).optional(),
  redisPort: z.number().int().min(1).max(65535).optional(),
  redisDatabase: z.number().int().min(0).max(15).optional(),
  redisTlsEnabled: z.boolean().optional(),
  redisUsername: z.string().trim().max(255).optional(),
  redisPassword: z.string().trim().min(1).max(256).optional(), // blank/omitted = unchanged
  clearRedisPassword: z.boolean().optional(),
  redisConnectTimeoutMs: z.number().int().min(100).max(30000).optional(),

  // Memcached
  memcachedServers: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
  memcachedBinaryProtocol: z.boolean().optional(),
  memcachedCompressionEnabled: z.boolean().optional(),
  memcachedCompressionThresholdBytes: z.number().int().min(0).max(10485760).optional(),
  memcachedUsername: z.string().trim().max(255).optional(),
  memcachedPassword: z.string().trim().min(1).max(256).optional(), // blank/omitted = unchanged
  clearMemcachedPassword: z.boolean().optional(),

  // WordPress Object Cache
  wpDropInInstalled: z.boolean().optional(),
  wpCacheKeySalt: z.string().trim().max(128).optional(),
});

/** POST /api/admin/cache/object/invalidate body. scope "group" resolves
 * to a SCAN pattern of `${keyPrefix}${group}:*` server-side; scope
 * "pattern" uses the raw pattern as-is (still prefixed with keyPrefix). */
export const objectCacheInvalidateInputSchema = z.object({
  scope: z.enum(["all", "group", "pattern"]),
  group: z.string().trim().min(1).max(64).optional(),
  pattern: z.string().trim().min(1).max(200).optional(),
});

/** POST /api/admin/cache/object/test body — which server to test when
 * the provider is memcached (it has a list; Redis only ever has one). */
export const objectCacheTestInputSchema = z.object({
  server: z.string().trim().max(255).optional(),
});

// ── Database Optimisation & Query Cache ─────────────────────────────────────

const cachedQuerySlotSchema = z.object({
  name: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  pattern: z.string().trim().max(500),
  ttlSeconds: z.number().int().min(5).max(86400),
  enabled: z.boolean(),
});

const reindexRequestSchema = z.object({
  table: z.string().trim().min(1).max(64),
  requestedAt: z.string(),
  status: z.enum(["pending", "running", "done", "failed"]),
});

export const dbOptimizationSettingsInputSchema = z.object({
  // 1. Redis Query Cache
  redisQueryCacheEnabled: z.boolean().optional(),
  redisQueryHost: z.string().trim().min(1).max(255).optional(),
  redisQueryPort: z.number().int().min(1).max(65535).optional(),
  redisQueryDatabase: z.number().int().min(0).max(15).optional(),
  redisQueryTlsEnabled: z.boolean().optional(),
  redisQueryUsername: z.string().trim().max(255).optional(),
  redisQueryPassword: z.string().trim().min(1).max(256).optional(),
  clearRedisQueryPassword: z.boolean().optional(),
  redisQueryConnectTimeoutMs: z.number().int().min(100).max(30000).optional(),

  // 2. Cached Query Results
  queryCacheDefaultTtlSeconds: z.number().int().min(5).max(86400).optional(),
  queryCacheKeyPrefix: z.string().trim().min(1).max(32).optional(),
  cachedQuerySlots: z.array(cachedQuerySlotSchema).max(20).optional(),

  // 3. Prepared Statements
  preparedStatementsEnabled: z.boolean().optional(),
  maxPreparedStatements: z.number().int().min(0).max(10000).optional(),
  statementTimeoutMs: z.number().int().min(0).max(600000).optional(),
  lockTimeoutMs: z.number().int().min(0).max(300000).optional(),
  idleInTransactionTimeoutMs: z.number().int().min(0).max(300000).optional(),

  // 4. Query Optimisation
  slowQueryThresholdMs: z.number().int().min(0).max(60000).optional(),
  workMemKb: z.number().int().min(1024).max(524288).optional(),
  poolMode: z.enum(["session", "transaction", "statement"]).optional(),
  poolSize: z.number().int().min(1).max(500).optional(),
  explainAnalyzeEnabled: z.boolean().optional(),

  // 5. Index Optimisation
  autoAnalyzeEnabled: z.boolean().optional(),
  autoAnalyzeSchedule: z.string().trim().max(100).optional(),
  pendingReindexRequests: z.array(reindexRequestSchema).max(20).optional(),
});

export const dbOptimizationQueryCacheActionSchema = z.object({
  action: z.enum(["test", "flush"]),
});

export const dbOptimizationAnalyzeActionSchema = z.object({
  action: z.enum(["analyze", "scan_indexes", "reindex"]),
  table: z.string().trim().min(1).max(64).optional(),
});

// ── Security-Aware Caching (Admin → Cache → Security) ───────────────────────
// Ranges mirror the CHECK constraints in migration 0052_security_cache.sql.
// signingSecret blank/omitted = leave the stored secret unchanged (same
// pattern as varnishPurgeKey in full-page cache); clearSigningSecret is the
// only way to actually wipe it.

export const securityCacheSettingsInputSchema = z.object({
  // 1. Do Not Cache Authenticated Pages
  doNotCacheAuthenticated: z.boolean().optional(),
  authCookieNames: z.array(cookiePattern).max(50).optional(),

  // 2. Separate Guest and Logged-in User Caches
  separateGuestLoggedInCache: z.boolean().optional(),
  sendVaryCookieHeader: z.boolean().optional(),

  // 3. CSRF-Safe Caching
  csrfSafeCachingEnabled: z.boolean().optional(),
  blockStateChangingMethods: z.boolean().optional(),

  // 4. Cookie-Aware Cache Rules
  cookieAwareRulesEnabled: z.boolean().optional(),
  bypassCookieNames: z.array(cookiePattern).max(50).optional(),
  bypassQueryParams: z.array(z.string().trim().min(1).max(100)).max(50).optional(),

  // 5. Cache Bypass for Admin, Login, and User Account Pages
  bypassPaths: z.array(pathPattern).max(100).optional(),

  // 6. Signed URLs / Signed Cookies
  signedUrlsEnabled: z.boolean().optional(),
  signedCookiesEnabled: z.boolean().optional(),
  signingSecret: z.string().trim().min(16, "Use at least 16 characters.").max(256).optional(),
  clearSigningSecret: z.boolean().optional(),
  signedUrlTtlSeconds: z.number().int().min(60).max(604800).optional(),
  signedUrlParamName: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores, and hyphens only")
    .optional(),
  signedUrlExpiresParamName: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores, and hyphens only")
    .optional(),
  signedCookieName: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, underscores, and hyphens only")
    .optional(),
  signedProtectedPaths: z.array(pathPattern).max(100).optional(),
});

/** POST /api/admin/cache/security/sign-url body — the admin "Generate test
 * signed URL / cookie" tool. Requires a signing secret to already be
 * stored (the route reads it server-side; nothing secret is ever sent in
 * this request body). */
export const securitySignUrlInputSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(/^\//, "Path must start with /"),
  kind: z.enum(["url", "cookie"]),
});

// --- Contact Form (/contact) -----------------------------------------------
// Server-side schema — mirrors the client-side ContactFormClient validation.
// Name/subject/message are trimmed and length-capped.  Email is validated
// as a proper address.  The honeypot field (website) must be empty; any
// value means an automated submission and the route rejects it early.

export const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters.")
    .max(120, "Name is too long (max 120 characters)."),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(255, "Email is too long."),
  subject: z
    .string()
    .trim()
    .min(3, "Subject must be at least 3 characters.")
    .max(200, "Subject is too long (max 200 characters)."),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters.")
    .max(5000, "Message is too long (max 5000 characters)."),
  /** Honeypot — must be empty; filled = bot. */
  website: z.string().max(0, "Bot detected.").optional().default(""),
});
