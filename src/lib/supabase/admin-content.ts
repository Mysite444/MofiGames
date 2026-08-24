import { upload as uploadToBlob } from "@vercel/blob/client";
import { createClient } from "./client";
import { validateMediaUpload, validateMediaFileName } from "../file-validation";
import { fetchCacheSettings } from "../cache-settings";
import { detectFileDimensions } from "../media-dimensions";

// Game thumbnails, game media, game builds, content images, and the
// media library all live in Vercel Blob under one of these five path
// prefixes (Blob has no real "buckets" — this is the same namespacing
// role Supabase Storage's buckets used to play, just folded into the
// pathname). See /api/admin/blob/upload, which only mints a client
// token for a pathname starting with one of these.
const BLOB_UPLOAD_URL = "/api/admin/blob/upload";
const BLOB_DELETE_URL = "/api/admin/blob/delete";

// Reads here go straight to Supabase (fast, and already fully protected —
// RLS on `games`/`categories` only ever returns published rows to non-
// admins, so there's nothing extra a route handler would add). Writes
// (create/update/delete) go through the /api/admin/* route handlers
// instead of hitting Supabase directly: those routes re-validate the
// payload server-side (shape, ranges, required fields per play_type) with
// zod and turn database constraint errors into clear messages, on top of
// the RLS policies on games/categories/storage that enforce the actual
// admin-only access regardless of what any client sends. Belt and
// suspenders — the /admin route guard (src/app/admin/layout.tsx) keeps
// non-admins out of the UI that calls any of this in the first place.

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // no body / not JSON — fall through to the generic error below
  }
  if (!response.ok) {
    const message =
      json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return json;
}

let uploadCacheSettingsCache: { value: Awaited<ReturnType<typeof fetchCacheSettings>>; expiresAt: number } | null =
  null;

/** Cache-duration lookup for the Storage upload calls below — a thin,
 * short-TTL memoization over fetchCacheSettings() (Admin → Cache →
 * Browser Cache) so a multi-file build upload (uploadGameBuild can loop
 * over hundreds of files) doesn't make a network round trip per file.
 * 30s is long enough to cover one upload session and short enough that a
 * settings change takes effect on the very next upload without a page
 * reload. */
async function getUploadCacheSettings() {
  if (uploadCacheSettingsCache && uploadCacheSettingsCache.expiresAt > Date.now()) {
    return uploadCacheSettingsCache.value;
  }
  const value = await fetchCacheSettings();
  uploadCacheSettingsCache = { value, expiresAt: Date.now() + 30_000 };
  return value;
}

export interface AdminGame {
  id: string;
  slug: string;
  title: string;
  category_slug: string;
  description: string;
  instructions: string;
  controls: string;
  thumbnail_url: string | null;
  cover_image_url: string | null;
  video_trailer_url: string | null;
  preview_video_url: string | null;
  loading_screen_url: string | null;
  estimated_loading_seconds: number | null;
  play_type: "embed" | "upload";
  embed_url: string | null;
  storage_path: string | null;
  developer: string;
  publisher: string;
  release_date: string | null;
  version: string;
  tag: "TOP" | "HOT" | "NEW" | "UPDATED" | null;
  rating: number;
  rating_count: number;
  plays: number;
  favorite_count: number;
  multiplayer: boolean;
  mobile_support: boolean;
  fullscreen_enabled: boolean;
  save_progress_enabled: boolean;
  width: number | null;
  height: number | null;
  orientation: "landscape" | "portrait";
  is_published: boolean;
  scheduled_publish_at: string | null;
  visibility: "public" | "private" | "unlisted";
  is_featured?: boolean;
  featured_order?: number | null;
  is_trending?: boolean;
  is_recommended?: boolean;
  is_editors_pick?: boolean;
  editors_pick_order?: number | null;
  is_sponsored?: boolean;
  sponsored_order?: number | null;
  sponsor_label?: string | null;
  meta_title: string;
  meta_description: string;
  seo_canonical_url: string | null;
  seo_focus_keyword: string;
  seo_secondary_keywords: string[];
  seo_h1_title: string;
  seo_excerpt: string;
  seo_author: string;
  seo_index: boolean;
  seo_follow: boolean;
  seo_max_snippet: number;
  seo_max_image_preview: "none" | "standard" | "large";
  seo_max_video_preview: number;
  seo_noarchive: boolean;
  seo_nosnippet: boolean;
  og_title: string;
  og_description: string;
  og_image_url: string | null;
  og_image_alt: string;
  twitter_title: string;
  twitter_description: string;
  twitter_image_url: string | null;
  twitter_image_alt: string;
  twitter_card: "summary" | "summary_large_image" | "app" | "player";
  schema_video_game: boolean;
  schema_software_application: boolean;
  schema_review: boolean;
  schema_breadcrumb: boolean;
  created_at: string;
  updated_at: string;
  tagIds: string[];
}

export interface AdminCategory {
  slug: string;
  name: string;
  icon: string;
  color_from: string;
  color_to: string;
  description: string;
  sort_order: number;
  created_at: string;
  seo_title: string;
  seo_description: string;
  seo_canonical_url: string | null;
  seo_focus_keyword: string;
  seo_h1_title: string;
  seo_index: boolean;
  breadcrumbs_enabled: boolean;
  schema_collection_page: boolean;
  og_image_url: string | null;
  // Homepage Placement
  show_on_homepage: boolean;
  homepage_position: number | null;
  homepage_label: string | null;
  // Display template (migration 0066)
  display_style: "default" | "portrait";
}

export type GameInput = Omit<AdminGame, "id" | "created_at" | "updated_at">;
export type CategoryInput = Omit<AdminCategory, "created_at">;

// --- Games ------------------------------------------------------------

export async function fetchAllGamesAdmin(): Promise<AdminGame[]> {
  const supabase = createClient();
  const [{ data, error }, { data: gameTags, error: tagError }] = await Promise.all([
    supabase.from("games").select("*").order("created_at", { ascending: false }),
    supabase.from("game_tags").select("game_id, tag_id"),
  ]);
  if (error) throw new Error(error.message);
  if (tagError) throw new Error(tagError.message);

  const tagsByGame = new Map<string, string[]>();
  for (const row of gameTags ?? []) {
    const list = tagsByGame.get(row.game_id) ?? [];
    list.push(row.tag_id);
    tagsByGame.set(row.game_id, list);
  }

  return (data ?? []).map((g) => ({ ...g, tagIds: tagsByGame.get(g.id) ?? [] }));
}

export async function createGame(input: GameInput): Promise<AdminGame> {
  const response = await fetch("/api/admin/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { game: AdminGame };
  return json.game;
}

export async function updateGame(id: string, input: Partial<GameInput>): Promise<AdminGame> {
  const response = await fetch(`/api/admin/games/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { game: AdminGame };
  return json.game;
}

export async function deleteGame(id: string): Promise<void> {
  const response = await fetch(`/api/admin/games/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}

// --- Orphaned game media cleanup ------------------------------------------
// Storage objects (thumbnails/cover images/trailers/preview videos/loading
// screens/build files) that no game row references any more — either from
// games deleted before storage cleanup existed, or from editing a game's
// media (uploads are timestamped, so replacing a file leaves the old one
// behind). Backs Admin → Games → "Clean up storage".

export interface OrphanBucketReport {
  scanned: number;
  orphanCount: number;
  truncated: boolean;
  sample: string[];
}

export type GameStorageBucket = "game-thumbnails" | "game-media" | "game-files";

export interface OrphanScanReport {
  buckets: Record<GameStorageBucket, OrphanBucketReport>;
  errors: string[];
}

/** Dry-run: reports orphaned Storage objects without deleting anything. */
export async function scanOrphanedGameFiles(): Promise<OrphanScanReport> {
  const response = await fetch("/api/admin/games/cleanup-orphaned-media");
  return (await parseJsonOrThrow(response)) as OrphanScanReport;
}

export interface OrphanCleanupReport {
  deletedCounts: Record<GameStorageBucket, number>;
  totalDeleted: number;
  truncated: Record<GameStorageBucket, boolean>;
  errors: string[];
}

/** Deletes every currently-orphaned Storage object. Re-scans server-side
 * immediately before deleting, so this is safe to call even if some time
 * has passed since a scanOrphanedGameFiles() preview. */
export async function cleanupOrphanedGameFiles(): Promise<OrphanCleanupReport> {
  const response = await fetch("/api/admin/games/cleanup-orphaned-media", { method: "POST" });
  return (await parseJsonOrThrow(response)) as OrphanCleanupReport;
}

// --- Content Management: Tags ---------------------------------------------

export interface AdminTag {
  id: string;
  slug: string;
  name: string;
  color: string;
  created_at: string;
  seo_title: string;
  seo_description: string;
  seo_canonical_url: string | null;
  seo_h1_title: string;
  seo_index: boolean;
}

export type TagInput = Omit<AdminTag, "id" | "created_at">;

export async function fetchAllTagsAdmin(): Promise<AdminTag[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("tags").select("*").order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createTag(input: TagInput): Promise<AdminTag> {
  const response = await fetch("/api/admin/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { tag: AdminTag };
  return json.tag;
}

export async function updateTag(id: string, input: Partial<TagInput>): Promise<AdminTag> {
  const response = await fetch(`/api/admin/tags/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { tag: AdminTag };
  return json.tag;
}

export async function deleteTag(id: string): Promise<void> {
  const response = await fetch(`/api/admin/tags/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}

// --- Content Management: Pages ---------------------------------------------

export interface AdminPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  meta_description: string;
  show_in_nav: boolean;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  seo_title: string;
  seo_canonical_url: string | null;
  seo_h1_title: string;
  seo_index: boolean;
  og_image_url: string | null;
}

export type PageInput = Omit<AdminPage, "id" | "created_at" | "updated_at">;

export async function fetchAllPagesAdmin(): Promise<AdminPage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPage(input: PageInput): Promise<AdminPage> {
  const response = await fetch("/api/admin/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { page: AdminPage };
  return json.page;
}

export async function updatePage(id: string, input: Partial<PageInput>): Promise<AdminPage> {
  const response = await fetch(`/api/admin/pages/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { page: AdminPage };
  return json.page;
}

export async function deletePage(id: string): Promise<void> {
  const response = await fetch(`/api/admin/pages/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}

// --- Content Management: Posts (Blog/News) ----------------------------------

export interface AdminPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image_url: string | null;
  author_name: string;
  is_published: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
  tagIds: string[];
  seo_title: string;
  seo_description: string;
  seo_canonical_url: string | null;
  seo_focus_keyword: string;
  seo_secondary_keywords: string[];
  seo_h1_title: string;
  seo_index: boolean;
  og_title: string;
  og_description: string;
  og_image_url: string | null;
  og_image_alt: string;
  twitter_card: "summary" | "summary_large_image" | "app" | "player";
}

export type PostInput = Omit<AdminPost, "id" | "created_at" | "updated_at">;

export async function fetchAllPostsAdmin(): Promise<AdminPost[]> {
  const supabase = createClient();
  const [{ data: posts, error }, { data: postTags, error: tagError }] = await Promise.all([
    supabase.from("posts").select("*").order("published_at", { ascending: false }),
    supabase.from("post_tags").select("post_id, tag_id"),
  ]);
  if (error) throw new Error(error.message);
  if (tagError) throw new Error(tagError.message);

  const tagsByPost = new Map<string, string[]>();
  for (const row of postTags ?? []) {
    const list = tagsByPost.get(row.post_id) ?? [];
    list.push(row.tag_id);
    tagsByPost.set(row.post_id, list);
  }

  return (posts ?? []).map((p) => ({ ...p, tagIds: tagsByPost.get(p.id) ?? [] }));
}

export async function createPost(input: PostInput): Promise<AdminPost> {
  const response = await fetch("/api/admin/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { post: AdminPost };
  return json.post;
}

export async function updatePost(id: string, input: Partial<PostInput>): Promise<AdminPost> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { post: AdminPost };
  return json.post;
}

export async function deletePost(id: string): Promise<void> {
  const response = await fetch(`/api/admin/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}

/** Uploads a blog post cover image and returns its public URL. Same
 * pattern as uploadThumbnail, just a separate bucket for content images. */
export async function uploadContentImage(slug: string, file: File): Promise<string> {
  const cacheSettings = await getUploadCacheSettings();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${slug}/${Date.now()}.${ext}`;
  const blob = await uploadToBlob(`content-images/${path}`, file, {
    access: "public",
    handleUploadUrl: BLOB_UPLOAD_URL,
    clientPayload: JSON.stringify({
      bucket: "content-images",
      cacheControlMaxAgeSeconds: cacheSettings.contentImagesMaxAge,
    }),
  });
  return blob.url;
}

// --- Homepage manager ---------------------------------------------------

export type HomepageSection = "featured" | "editors_pick" | "sponsored";

/** Persists the current left-to-right order of a homepage section (call
 * with the *full* ordered list of game ids currently in that section). */
export async function reorderHomepageSection(
  section: HomepageSection,
  gameIds: string[]
): Promise<void> {
  const response = await fetch("/api/admin/homepage/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section, gameIds }),
  });
  await parseJsonOrThrow(response);
}

// --- Categories ---------------------------------------------------------

export async function fetchAllCategoriesAdmin(): Promise<AdminCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCategory(input: CategoryInput): Promise<AdminCategory> {
  const response = await fetch("/api/admin/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { category: AdminCategory };
  return json.category;
}

export async function updateCategory(
  slug: string,
  input: Partial<CategoryInput>
): Promise<AdminCategory> {
  const response = await fetch(`/api/admin/categories/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { category: AdminCategory };
  return json.category;
}

export async function deleteCategory(slug: string): Promise<void> {
  const response = await fetch(`/api/admin/categories/${encodeURIComponent(slug)}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}

// --- Homepage Categories Manager -------------------------------------------
// Unifies the 25 registry rows (system-curated + built-in genres, see
// src/lib/homepage-section-registry.ts) with real DB categories into one
// admin screen: a shared global position number-space, editable heading,
// visibility, and — new for every row type, including real categories —
// manually pinning any published game onto any homepage row.

export interface HomepageSectionRow {
  section_key: string;
  section_type: "system" | "genre";
  position: number;
  label: string | null;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface HomepageSectionGamePin {
  id: string;
  section_key: string;
  game_id: string;
  position: number;
  created_at: string;
}

/** Direct read (RLS: publicly readable) — same pattern as fetchAllCategoriesAdmin. */
export async function fetchHomepageSections(): Promise<HomepageSectionRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("homepage_sections")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateHomepageSection(
  key: string,
  input: { label?: string | null; position?: number; is_visible?: boolean }
): Promise<HomepageSectionRow> {
  const response = await fetch(`/api/admin/homepage/sections/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { section: HomepageSectionRow };
  return json.section;
}

/** Persists a brand-new top-to-bottom order across EVERY homepage row —
 * system, genre, and real categories together (see HomepageCategoriesManager).
 * Positions are rewritten 0, 10, 20... across the whole combined list, then
 * each row is routed to whichever backend actually owns it: real categories
 * keep using categories.homepage_position (migration 0029), system/genre
 * rows use the new homepage_sections table — both read back into the same
 * merged, sorted list on the public homepage. */
export async function reorderHomepageCategories(
  rows: Array<{ key: string; kind: "system" | "genre" | "category" }>
): Promise<void> {
  const updates = rows.map((row, index) => {
    // Start at 10, not 0 — categories.homepage_position requires >= 1.
    const position = (index + 1) * 10;
    if (row.kind === "category") {
      const slug = row.key.slice("category:".length);
      return updateCategory(slug, { homepage_position: position });
    }
    return updateHomepageSection(row.key, { position });
  });
  await Promise.all(updates);
}

/** All manual game pins, across every section — fetched once and grouped
 * client-side by section_key (cheap at admin scale, avoids N round trips). */
export async function fetchHomepageSectionGamePins(): Promise<HomepageSectionGamePin[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("homepage_section_games")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Pins a game onto a row — additive, the game keeps showing up via
 * whatever automatic rule (category_slug, curated flag, tag) already
 * applied to it, this just adds it to a row it wouldn't otherwise be in. */
export async function addHomepageSectionGame(sectionKey: string, gameId: string): Promise<void> {
  const response = await fetch("/api/admin/homepage/sections/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section_key: sectionKey, game_id: gameId }),
  });
  await parseJsonOrThrow(response);
}

export async function removeHomepageSectionGame(sectionKey: string, gameId: string): Promise<void> {
  const response = await fetch("/api/admin/homepage/sections/games", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section_key: sectionKey, game_id: gameId }),
  });
  await parseJsonOrThrow(response);
}

export async function reorderHomepageSectionGames(sectionKey: string, gameIds: string[]): Promise<void> {
  const response = await fetch("/api/admin/homepage/sections/games/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section_key: sectionKey, gameIds }),
  });
  await parseJsonOrThrow(response);
}

// --- File uploads ---------------------------------------------------------

/** Pulls the bucket-relative path out of a public Vercel Blob URL, e.g.
 * "https://abc123.public.blob.vercel-storage.com/game-media/some-slug/
 * cover-1.png" -> "some-slug/cover-1.png". Returns null for anything
 * that isn't a blob URL under that bucket prefix (unset field, external
 * URL like a YouTube trailer link, etc). Deliberately duplicated from
 * the same helper in lib/supabase/game-storage-cleanup.ts rather than
 * shared — that module is server-route-only, and this one runs in the
 * browser as part of the admin upload flow; keeping them independent
 * avoids coupling client and server bundles over one small pure
 * function. */
function pathFromBlobUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const marker = `/${bucket}/`;
  if (!pathname.startsWith(marker)) return null;
  const rest = pathname.slice(marker.length).split(/[?#]/)[0];
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/** Best-effort delete of one or more Vercel Blob objects, given their
 * bucket-prefixed pathnames (e.g. "game-thumbnails/some-slug/123.jpg").
 * Deletion needs BLOB_READ_WRITE_TOKEN, which the browser never holds,
 * so this always goes through /api/admin/blob/delete rather than a
 * direct SDK call — see that route for why. */
async function deleteBlobPaths(paths: string[]): Promise<void> {
  const response = await fetch(BLOB_DELETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  await parseJsonOrThrow(response);
}

/** Uploads a thumbnail image for a game and returns its public URL. Each
 * upload gets a fresh timestamped path (see `path` below) rather than
 * overwriting in place, so on a replace — `previousUrl` is the game's
 * current thumbnail_url before this upload — the old file is removed
 * once the new one is up. That removal is best-effort: a failure there
 * must never block saving the game, since Admin → Games → "Clean up
 * storage" (scanOrphanedGameFiles/cleanupOrphanedGameFiles) is the
 * backstop for anything it misses. */
export async function uploadThumbnail(slug: string, file: File, previousUrl?: string | null): Promise<string> {
  const cacheSettings = await getUploadCacheSettings();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${slug}/${Date.now()}.${ext}`;
  const blob = await uploadToBlob(`game-thumbnails/${path}`, file, {
    access: "public",
    handleUploadUrl: BLOB_UPLOAD_URL,
    clientPayload: JSON.stringify({
      bucket: "game-thumbnails",
      cacheControlMaxAgeSeconds: cacheSettings.gameThumbnailsMaxAge,
    }),
  });

  const previousPath = pathFromBlobUrl(previousUrl, "game-thumbnails");
  if (previousPath && previousPath !== path) {
    await deleteBlobPaths([`game-thumbnails/${previousPath}`]).catch(() => undefined);
  }

  return blob.url;
}

/** Uploads any other game media file (cover image, trailer/preview video,
 * loading screen image) to the shared `game-media` bucket and returns its
 * public URL. `kind` just namespaces the storage path per game.
 * `previousUrl` (the game's current value for that field before this
 * upload) is removed after a successful upload, same replace-cleanup
 * reasoning as uploadThumbnail above. */
export async function uploadGameMedia(
  slug: string,
  kind: "cover" | "trailer" | "preview" | "loading-screen",
  file: File,
  previousUrl?: string | null
): Promise<string> {
  const cacheSettings = await getUploadCacheSettings();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${slug}/${kind}-${Date.now()}.${ext}`;
  const blob = await uploadToBlob(`game-media/${path}`, file, {
    access: "public",
    handleUploadUrl: BLOB_UPLOAD_URL,
    clientPayload: JSON.stringify({
      bucket: "game-media",
      cacheControlMaxAgeSeconds: cacheSettings.gameMediaMaxAge,
    }),
  });

  const previousPath = pathFromBlobUrl(previousUrl, "game-media");
  if (previousPath && previousPath !== path) {
    await deleteBlobPaths([`game-media/${previousPath}`]).catch(() => undefined);
  }

  return blob.url;
}

/**
 * Uploads an entire game build (a folder of files selected via
 * `<input type="file" webkitdirectory>`) preserving relative paths, and
 * returns the storage path to its entry file (index.html by default) —
 * this is what gets saved as games.storage_path.
 */
export async function uploadGameBuild(
  slug: string,
  files: FileList,
  onProgress?: (done: number, total: number) => void
): Promise<string> {
  // Unlike the other buckets, a game build's storage paths are *not*
  // stamped with the upload time — re-uploading a build overwrites the
  // same "{slug}/index.html" etc. in place (allowOverwrite: true, set
  // server-side in /api/admin/blob/upload), so this bucket keeps a much
  // lower cache ceiling (see game_files_max_age in migration 0033) than
  // the versioned buckets above.
  const cacheSettings = await getUploadCacheSettings();
  const fileArray = Array.from(files);
  const total = fileArray.length;
  let done = 0;

  for (const file of fileArray) {
    // webkitdirectory gives each file a webkitRelativePath like
    // "my-game-build/index.html" — strip the top-level folder name so
    // storage paths are just "{slug}/index.html", "{slug}/assets/x.png", etc.
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const withoutTopFolder = relPath.split("/").slice(1).join("/") || relPath;
    const storagePath = `${slug}/${withoutTopFolder}`;

    try {
      await uploadToBlob(`game-files/${storagePath}`, file, {
        access: "public",
        handleUploadUrl: BLOB_UPLOAD_URL,
        clientPayload: JSON.stringify({
          bucket: "game-files",
          cacheControlMaxAgeSeconds: cacheSettings.gameFilesMaxAge,
        }),
      });
    } catch (err) {
      throw new Error(`Failed uploading ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
    }

    done++;
    onProgress?.(done, total);
  }

  // Prefer an index.html at the root of the build; fall back to whatever
  // html file was found first if the build doesn't use that convention.
  const entryFile =
    fileArray.find((f) => {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const withoutTop = rel.split("/").slice(1).join("/") || rel;
      return withoutTop.toLowerCase() === "index.html";
    }) ?? fileArray.find((f) => f.name.toLowerCase().endsWith(".html"));

  if (!entryFile) {
    throw new Error("No index.html (or any .html file) found in the uploaded build.");
  }

  const entryRel =
    (entryFile as File & { webkitRelativePath?: string }).webkitRelativePath || entryFile.name;
  const entryWithoutTop = entryRel.split("/").slice(1).join("/") || entryRel;
  return `${slug}/${entryWithoutTop}`;
}

// --- Media library -------------------------------------------------------
// Backs Admin → Media Management (Images / Thumbnails / Icons / Videos /
// GIFs). One shared `media-library` storage bucket namespaced by category,
// with a `media_assets` row per file so the admin UI can list/delete without
// paging through storage directly. Direct-to-Supabase, same lighter pattern
// as uploadThumbnail/uploadGameMedia above — RLS on both the table and the
// bucket (see migration 0009) is what actually enforces admin-only writes.

export type MediaCategory = "image" | "thumbnail" | "icon" | "video" | "gif";

export interface AdminMediaAsset {
  id: string;
  category: MediaCategory;
  file_name: string;
  storage_path: string;
  url: string;
  mime_type: string | null;
  file_size: number | null;
  alt_text: string | null;
  title: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
}

export async function fetchMediaAssets(category: MediaCategory): Promise<AdminMediaAsset[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("media_assets")
    .select("*")
    .eq("category", category)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Uploads a file into the shared media-library bucket (namespaced by
 * category) and records it in `media_assets`, returning the new row.
 * Pixel dimensions (for images/gifs/videos) are read off the file in the
 * browser and stored alongside it — see ../media-dimensions. */
export async function uploadMediaAsset(
  category: MediaCategory,
  file: File
): Promise<AdminMediaAsset> {
  const check = validateMediaUpload(category, file);
  if (!check.valid) throw new Error(check.error ?? "That file isn't allowed.");

  const supabase = createClient();
  const [cacheSettings, dimensions] = await Promise.all([
    getUploadCacheSettings(),
    detectFileDimensions(file, category),
  ]);
  const ext = file.name.split(".").pop() || "bin";
  const path = `${category}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const blob = await uploadToBlob(`media-library/${path}`, file, {
    access: "public",
    handleUploadUrl: BLOB_UPLOAD_URL,
    clientPayload: JSON.stringify({
      bucket: "media-library",
      cacheControlMaxAgeSeconds: cacheSettings.mediaLibraryMaxAge,
    }),
  });

  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      category,
      file_name: file.name,
      storage_path: path,
      url: blob.url,
      mime_type: file.type || null,
      file_size: file.size,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Deletes a media asset: best-effort remove the underlying file from
 * Vercel Blob, then remove its `media_assets` row regardless of whether
 * that succeeded. The blob-delete step tolerates "already gone" failures
 * (e.g. BlobNotFoundError) on the server — see /api/admin/blob/delete —
 * so a stale row can always be cleared from the library; it only ever
 * throws here for a genuine storage misconfiguration (bad/missing
 * BLOB_READ_WRITE_TOKEN), in which case the row is deliberately left in
 * place rather than reporting a false "deleted". */
export async function deleteMediaAsset(asset: AdminMediaAsset): Promise<void> {
  const supabase = createClient();
  await deleteBlobPaths([`media-library/${asset.storage_path}`]);

  const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
  if (error) throw new Error(error.message);
}

/** Patch used by the Edit Media panel. `file_name` is a display label only
 * — it's decoupled from the randomized `storage_path`/`url` the file
 * actually lives at (see uploadMediaAsset above), so renaming it never
 * touches storage. `width`/`height` are included so the panel's "Detect"
 * action (for assets uploaded before those columns existed) can persist
 * what it finds. Omit a key to leave that column untouched; pass `null`
 * to clear a text field. */
export interface MediaAssetUpdateInput {
  file_name?: string;
  alt_text?: string | null;
  title?: string | null;
  description?: string | null;
  width?: number | null;
  height?: number | null;
}

export async function updateMediaAsset(
  assetId: string,
  updates: MediaAssetUpdateInput
): Promise<AdminMediaAsset> {
  const patch: Record<string, unknown> = {};

  if (updates.file_name !== undefined) {
    const check = validateMediaFileName(updates.file_name);
    if (!check.valid) throw new Error(check.error ?? "Invalid filename.");
    patch.file_name = updates.file_name.trim();
  }
  if (updates.alt_text !== undefined) patch.alt_text = updates.alt_text?.trim() || null;
  if (updates.title !== undefined) patch.title = updates.title?.trim() || null;
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.width !== undefined) patch.width = updates.width;
  if (updates.height !== undefined) patch.height = updates.height;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("media_assets")
    .update(patch)
    .eq("id", assetId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// --- Comment moderation ----------------------------------------------------
// Reads go through /api/admin/comments (unlike games/categories reads,
// which stay direct) because this one does pagination/search server-side
// rather than shipping every comment on every game to the browser.
// Deletes reuse the same DELETE /api/comments/:id route the public
// comments UI uses — it already allows either the comment's author or an
// admin (see migration 0005 + that route), so there's no need for a
// separate admin-only delete endpoint.

export interface AdminComment {
  id: string;
  gameSlug: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface AdminCommentsPage {
  comments: AdminComment[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchCommentsAdmin(options: {
  page?: number;
  gameSlug?: string;
  q?: string;
}): Promise<AdminCommentsPage> {
  const params = new URLSearchParams();
  params.set("page", String(options.page ?? 1));
  if (options.gameSlug) params.set("gameSlug", options.gameSlug);
  if (options.q) params.set("q", options.q);

  const response = await fetch(`/api/admin/comments?${params.toString()}`);
  return (await parseJsonOrThrow(response)) as AdminCommentsPage;
}

export async function deleteCommentAdmin(id: string): Promise<void> {
  const response = await fetch(`/api/comments/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}

// --- SEO Management ----------------------------------------------------
// Backs Admin → SEO Management: Global Settings, Sitemaps, robots.txt,
// Redirect Manager, Structured Data overview, SEO Analysis, and the AI SEO
// Assistant. Reads AND writes both go through /api/admin/seo/* here
// (unlike games/categories) because settings is a single row every admin
// page needs, redirects double as public data read by middleware, and
// analysis/AI-generate require server-side computation — simplest to keep
// this whole area behind route handlers rather than a direct-read split.

export interface AdminSeoSettings {
  site_name: string;
  title_template: string;
  default_meta_description: string;
  default_author: string;
  default_language: string;
  default_region: string;
  default_robots_index: boolean;
  default_robots_follow: boolean;
  canonical_domain: "www" | "non-www";
  trailing_slash: "add" | "remove" | "ignore";
  google_site_verification: string;
  bing_site_verification: string;
  yandex_site_verification: string;
  baidu_site_verification: string;
  home_seo_title: string;
  home_meta_description: string;
  home_og_image_url: string | null;
  default_og_image_url: string | null;
  default_og_image_alt: string;
  twitter_site: string;
  twitter_creator: string;
  twitter_card_type: "summary" | "summary_large_image" | "app" | "player";
  org_name: string;
  org_logo_url: string | null;
  org_same_as: string[];
  robots_txt_override: string | null;
  sitemap_games_enabled: boolean;
  sitemap_categories_enabled: boolean;
  sitemap_tags_enabled: boolean;
  sitemap_blog_enabled: boolean;
  sitemap_pages_enabled: boolean;
  sitemap_images_enabled: boolean;
  index_games: boolean;
  index_categories: boolean;
  index_tags: boolean;
  index_blog: boolean;
  index_pages: boolean;
  index_search_pages: boolean;
  index_author_pages: boolean;
  updated_at: string;
}

export type SeoSettingsInput = Partial<Omit<AdminSeoSettings, "updated_at">>;

export async function fetchSeoSettings(): Promise<AdminSeoSettings> {
  const response = await fetch("/api/admin/seo/settings");
  const json = (await parseJsonOrThrow(response)) as { settings: AdminSeoSettings };
  return json.settings;
}

export async function updateSeoSettings(input: SeoSettingsInput): Promise<AdminSeoSettings> {
  const response = await fetch("/api/admin/seo/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { settings: AdminSeoSettings };
  return json.settings;
}

// --- Site Settings: Site Identity ---------------------------------------
// Backs Admin → Site Settings → Site Identity (Site Name, Site Tagline,
// Logo, Favicon). Separate from SEO Global Settings above — this is the
// front-of-house branding that shows up in the header/logo and browser
// tab icon, editable without touching code.

export interface AdminSiteIdentity {
  site_name: string;
  site_tagline: string;
  logo_url: string | null;
  // Full favicon / app-icon set. favicon_url is the classic favicon.ico;
  // see migration 0061_favicon_icon_set.sql for what each one backs.
  favicon_url: string | null;
  favicon_16_url: string | null;
  favicon_32_url: string | null;
  favicon_svg_url: string | null;
  apple_touch_icon_url: string | null;
  icon_192_url: string | null;
  icon_512_url: string | null;
  copyright_text: string;
  updated_at: string;
}

export type SiteIdentityInput = Partial<Omit<AdminSiteIdentity, "updated_at">>;

export async function fetchSiteIdentity(): Promise<AdminSiteIdentity> {
  const response = await fetch("/api/admin/site-identity");
  const json = (await parseJsonOrThrow(response)) as { settings: AdminSiteIdentity };
  return json.settings;
}

export async function updateSiteIdentity(input: SiteIdentityInput): Promise<AdminSiteIdentity> {
  const response = await fetch("/api/admin/site-identity", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { settings: AdminSiteIdentity };
  return json.settings;
}

// --- Monetization: Advertisement Management -----------------------------
// Backs Admin → Monetization → Advertisement Management. One singleton
// row covering every placement the public site can render: Google
// AdSense, Header, Sidebar, In-Game, Footer, Sticky, Reward, and a
// freeform Custom HTML slot.

export interface AdminAdSettings {
  adsense_enabled: boolean;
  adsense_client_id: string | null;
  adsense_auto_ads: boolean;

  header_ads_enabled: boolean;
  header_ads_slot_id: string | null;
  header_ads_code: string | null;

  player_ads_enabled: boolean;
  player_ads_slot_id: string | null;
  player_ads_code: string | null;

  sidebar_ads_enabled: boolean;
  sidebar_ads_slot_id: string | null;
  sidebar_ads_code: string | null;

  ingame_ads_enabled: boolean;
  ingame_ads_slot_id: string | null;
  ingame_ads_code: string | null;
  ingame_ads_frequency: number;

  footer_ads_enabled: boolean;
  footer_ads_slot_id: string | null;
  footer_ads_code: string | null;

  sticky_ads_enabled: boolean;
  sticky_ads_slot_id: string | null;
  sticky_ads_code: string | null;
  sticky_ads_position: "top" | "bottom";
  sticky_ads_dismissible: boolean;

  reward_ads_enabled: boolean;
  reward_ads_slot_id: string | null;
  reward_ads_code: string | null;
  reward_ads_reward_label: string;

  custom_html_ads_enabled: boolean;
  custom_html_ads_code: string | null;

  updated_at: string;
}

export type AdSettingsInput = Partial<Omit<AdminAdSettings, "updated_at">>;

export async function fetchAdSettings(): Promise<AdminAdSettings> {
  const response = await fetch("/api/admin/ads");
  const json = (await parseJsonOrThrow(response)) as { settings: AdminAdSettings };
  return json.settings;
}

export async function updateAdSettings(input: AdSettingsInput): Promise<AdminAdSettings> {
  const response = await fetch("/api/admin/ads", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { settings: AdminAdSettings };
  return json.settings;
}

// --- Monetization: Ad Protection -----------------------------------------
// Backs Admin → Monetization → Ad Protection. See migration 0024 for the
// underlying tables (ad_protection_settings, ip_intel_ranges,
// ad_protection_rules, ad_events, ad_protection_actions) and
// src/app/api/ads/track/route.ts for the public write path.

export interface AdminAdProtectionSettings {
  invalid_click_detection_enabled: boolean;
  click_frequency_limit_enabled: boolean;
  click_frequency_max: number;
  click_frequency_window_seconds: number;
  impression_frequency_limit_enabled: boolean;
  impression_frequency_max: number;
  impression_frequency_window_seconds: number;
  suspicious_user_detection_enabled: boolean;
  bot_detection_enabled: boolean;
  vpn_proxy_detection_enabled: boolean;
  datacenter_ip_detection_enabled: boolean;
  auto_ad_disable_enabled: boolean;
  auto_ad_disable_risk_threshold: number;
  auto_ip_blocking_enabled: boolean;
  auto_ip_blocking_risk_threshold: number;
  ctr_alert_threshold_pct: number;
  ip_ranges_last_synced_at: string | null;
  ip_ranges_count: number;
  updated_at: string;
}
export type AdProtectionSettingsInput = Partial<Omit<AdminAdProtectionSettings, "updated_at" | "ip_ranges_last_synced_at" | "ip_ranges_count">>;

export async function fetchAdProtectionSettings(): Promise<AdminAdProtectionSettings> {
  const response = await fetch("/api/admin/ads/protection/settings");
  const json = (await parseJsonOrThrow(response)) as { settings: AdminAdProtectionSettings };
  return json.settings;
}

export async function updateAdProtectionSettings(input: AdProtectionSettingsInput): Promise<AdminAdProtectionSettings> {
  const response = await fetch("/api/admin/ads/protection/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { settings: AdminAdProtectionSettings };
  return json.settings;
}

export async function syncIpIntelRanges(): Promise<{ results: { category: string; count: number }[]; totalRanges: number }> {
  const response = await fetch("/api/admin/ads/protection/sync-ip-ranges", { method: "POST" });
  return (await parseJsonOrThrow(response)) as { results: { category: string; count: number }[]; totalRanges: number };
}

export interface AdProtectionDashboard {
  overview: {
    totalImpressions: number;
    totalClicks: number;
    ctr: number;
    trafficQualityScore: number;
    blockedCount: number;
    botCount: number;
    vpnCount: number;
    datacenterCount: number;
    blacklistedCount: number;
  };
  ctrMonitoring: {
    todayImpressions: number;
    todayClicks: number;
    todayCtr: number;
    alertThresholdPct: number;
    alert: boolean;
  };
  placementBreakdown: { placement: string; impressions: number; clicks: number; ctr: number; blocked: number }[];
  trend: { date: string; impressions: number; clicks: number; flagged: number }[];
}

export async function fetchAdProtectionDashboard(): Promise<AdProtectionDashboard> {
  const response = await fetch("/api/admin/ads/protection/dashboard");
  return (await parseJsonOrThrow(response)) as AdProtectionDashboard;
}

export interface AdProtectionEvent {
  id: string;
  event_type: "impression" | "click";
  placement: string;
  path: string;
  ip: string | null;
  country: string | null;
  device_type: string;
  browser: string;
  os: string;
  is_bot: boolean;
  bot_reasons: string[];
  is_vpn: boolean;
  is_datacenter: boolean;
  rule_match: string | null;
  risk_score: number;
  blocked: boolean;
  block_reason: string | null;
  created_at: string;
}

export interface AdProtectionAction {
  id: string;
  action_type: "auto_ip_block" | "auto_ad_disable";
  target_type: "ip" | "visitor";
  target_value: string;
  reason: string | null;
  risk_score: number | null;
  created_at: string;
}

export async function fetchAdProtectionReports(
  filter: "all" | "blocked" | "bot" | "vpn" | "datacenter" | "blacklisted" = "all"
): Promise<{ events: AdProtectionEvent[]; actions: AdProtectionAction[] }> {
  const response = await fetch(`/api/admin/ads/protection/reports?filter=${filter}`);
  return (await parseJsonOrThrow(response)) as { events: AdProtectionEvent[]; actions: AdProtectionAction[] };
}

export interface AdProtectionRule {
  id: string;
  target_type: "ip" | "visitor";
  mode: "whitelist" | "blacklist";
  value: string;
  reason: string | null;
  auto_created: boolean;
  created_at: string;
}

export async function fetchAdProtectionRules(): Promise<AdProtectionRule[]> {
  const response = await fetch("/api/admin/ads/protection/rules");
  const json = (await parseJsonOrThrow(response)) as { rules: AdProtectionRule[] };
  return json.rules;
}

export async function createAdProtectionRule(input: {
  targetType: "ip" | "visitor";
  mode: "whitelist" | "blacklist";
  value: string;
  reason?: string;
}): Promise<AdProtectionRule> {
  const response = await fetch("/api/admin/ads/protection/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { rule: AdProtectionRule };
  return json.rule;
}

export async function deleteAdProtectionRule(id: string): Promise<void> {
  const response = await fetch(`/api/admin/ads/protection/rules/${id}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}

export interface AdProtectionHeatmap {
  placement: string | null;
  placements: string[];
  grid: number[][];
  totalClicks: number;
}

export async function fetchAdProtectionHeatmap(placement?: string): Promise<AdProtectionHeatmap> {
  const url = placement ? `/api/admin/ads/protection/heatmap?placement=${encodeURIComponent(placement)}` : "/api/admin/ads/protection/heatmap";
  const response = await fetch(url);
  return (await parseJsonOrThrow(response)) as AdProtectionHeatmap;
}

export interface AdPlacementCheck {
  checks: { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string }[];
  summary: { failCount: number; warnCount: number; passCount: number };
}

export async function fetchAdPlacementCheck(): Promise<AdPlacementCheck> {
  const response = await fetch("/api/admin/ads/protection/placement-check");
  return (await parseJsonOrThrow(response)) as AdPlacementCheck;
}

// --- Site Settings: Menu Links ------------------------------------------
// Backs Admin → Site Settings → Menu Links — custom nav links an admin can
// add/edit/remove/reorder, rendered in the sidebar/drawer's "Custom Links"
// section (see NavList.tsx). Reading the list is a direct table read (RLS:
// admins can select all rows, same pattern as Pages); writes go through
// the route handlers so they're validated server-side.

export interface AdminMenuLink {
  id: string;
  label: string;
  url: string;
  open_in_new_tab: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type MenuLinkInput = Omit<AdminMenuLink, "id" | "created_at" | "updated_at">;

export async function fetchAllMenuLinksAdmin(): Promise<AdminMenuLink[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("menu_links")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createMenuLink(input: MenuLinkInput): Promise<AdminMenuLink> {
  const response = await fetch("/api/admin/menu-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { link: AdminMenuLink };
  return json.link;
}

export async function updateMenuLink(id: string, input: Partial<MenuLinkInput>): Promise<AdminMenuLink> {
  const response = await fetch(`/api/admin/menu-links/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { link: AdminMenuLink };
  return json.link;
}

export async function deleteMenuLink(id: string): Promise<void> {
  const response = await fetch(`/api/admin/menu-links/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}

export interface AdminRedirect {
  id: string;
  source_path: string;
  destination_path: string | null;
  redirect_type: 301 | 302 | 307 | 308 | 410;
  is_active: boolean;
  hit_count: number;
  last_hit_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RedirectInput = Omit<
  AdminRedirect,
  "id" | "hit_count" | "last_hit_at" | "created_at" | "updated_at"
>;

export async function fetchAllRedirectsAdmin(): Promise<AdminRedirect[]> {
  const response = await fetch("/api/admin/seo/redirects");
  const json = (await parseJsonOrThrow(response)) as { redirects: AdminRedirect[] };
  return json.redirects;
}

export async function createRedirect(input: RedirectInput): Promise<AdminRedirect> {
  const response = await fetch("/api/admin/seo/redirects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { redirect: AdminRedirect };
  return json.redirect;
}

export async function updateRedirect(
  id: string,
  input: Partial<RedirectInput>
): Promise<AdminRedirect> {
  const response = await fetch(`/api/admin/seo/redirects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { redirect: AdminRedirect };
  return json.redirect;
}

export async function deleteRedirect(id: string): Promise<void> {
  const response = await fetch(`/api/admin/seo/redirects/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await parseJsonOrThrow(response);
}

export interface SeoAnalysisItem {
  itemType: "game" | "category" | "post" | "page";
  id: string;
  title: string;
  url: string;
  score: number;
  issues: { severity: "error" | "warning" | "info"; message: string }[];
  wordCount: number;
  titleLength: number;
  descriptionLength: number;
}

export async function fetchSeoAnalysis(): Promise<SeoAnalysisItem[]> {
  const response = await fetch("/api/admin/seo/analysis");
  const json = (await parseJsonOrThrow(response)) as { results: SeoAnalysisItem[] };
  return json.results;
}

export type AiSeoField =
  | "seo_title"
  | "meta_description"
  | "focus_keyword"
  | "secondary_keywords"
  | "seo_excerpt"
  | "og_title"
  | "og_description"
  | "twitter_title"
  | "twitter_description";

/** Calls the AI SEO Assistant (Admin → any content form → "Generate with
 * AI") to draft one or more SEO fields from a title/description. Returns
 * only the fields that were asked for; the caller decides whether to
 * apply them (nothing is auto-saved). */
export async function generateSeoWithAi(input: {
  itemType: "game" | "category" | "post";
  title: string;
  description?: string;
  category?: string;
  fields: AiSeoField[];
}): Promise<Partial<Record<AiSeoField, string | string[]>>> {
  const response = await fetch("/api/admin/seo/ai-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as {
    result: Partial<Record<AiSeoField, string | string[]>>;
  };
  return json.result;
}

// --- Analytics ---------------------------------------------------------

export interface AnalyticsOverview {
  overview: {
    totalGames: number;
    totalUsers: number;
    onlineUsers: number;
    totalPlays: number;
    todayPlays: number;
    todayVisitors: number;
    weeklyVisitors: number;
    monthlyVisitors: number;
    totalVisitors: number;
  };
  visitorTrend: { date: string; visitors: number }[];
  deviceDistribution: Record<string, number>;
  trafficSources: Record<string, number>;
  recentActivity: { type: string; label: string; href: string | null; at: string }[];
}

export async function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  const response = await fetch("/api/admin/analytics/overview");
  return (await parseJsonOrThrow(response)) as AnalyticsOverview;
}

export interface AnalyticsGameRow {
  id: string;
  slug: string;
  title: string;
  category_slug: string;
  plays: number;
  rating: number;
  rating_count: number;
  favorite_count: number;
  is_featured: boolean;
  is_published: boolean;
  created_at: string;
  plays_7d?: number;
}

export interface AnalyticsGames {
  summary: { totalGames: number; totalFavorites: number; averageRating: number; totalReviews: number };
  mostPlayed: AnalyticsGameRow[];
  leastPlayed: AnalyticsGameRow[];
  trending: AnalyticsGameRow[];
  recentlyAdded: AnalyticsGameRow[];
  featured: AnalyticsGameRow[];
  categoryStats: { slug: string; name: string; gameCount: number; totalPlays: number }[];
}

export async function fetchAnalyticsGames(): Promise<AnalyticsGames> {
  const response = await fetch("/api/admin/analytics/games");
  return (await parseJsonOrThrow(response)) as AnalyticsGames;
}

export interface AnalyticsUsers {
  summary: {
    totalUsers: number;
    newUsersToday: number;
    activeUsers7d: number;
    activeUsers30d: number;
    registeredVisitors30d: number;
    guestVisitors30d: number;
    totalSearches: number;
  };
  topSearchKeywords: { query: string; count: number }[];
  searchesWithNoResults: { query: string; count: number }[];
}

export async function fetchAnalyticsUsers(): Promise<AnalyticsUsers> {
  const response = await fetch("/api/admin/analytics/users");
  return (await parseJsonOrThrow(response)) as AnalyticsUsers;
}

export interface AnalyticsContentHealth {
  totalPublishedGames: number;
  missingThumbnail: { id: string; slug: string; title: string }[];
  missingCoverImage: { id: string; slug: string; title: string }[];
  missingDescription: { id: string; slug: string; title: string }[];
  missingInstructions: { id: string; slug: string; title: string }[];
  missingTags: { id: string; slug: string; title: string }[];
  missingSeoDescription: { id: string; slug: string; title: string }[];
  brokenEmbedUrls: { id: string; slug: string; title: string }[];
}

export async function fetchAnalyticsContentHealth(): Promise<AnalyticsContentHealth> {
  const response = await fetch("/api/admin/analytics/content-health");
  return (await parseJsonOrThrow(response)) as AnalyticsContentHealth;
}

export interface BrokenLinkResult {
  id: string;
  slug: string;
  title: string;
  url: string;
  source: "embed_url" | "uploaded file";
  reason: string;
}

export interface LinkCheckReport {
  checked: number;
  totalPublishedGames: number;
  truncated: boolean;
  broken: BrokenLinkResult[];
}

/** Triggers a real, on-demand network check of every published game's
 * play URL (see /api/admin/analytics/content-health/check-links). Can
 * take a while on a large catalog — the caller should show a loading
 * state, not assume this resolves instantly. */
export async function runLinkCheck(): Promise<LinkCheckReport> {
  const response = await fetch("/api/admin/analytics/content-health/check-links", { method: "POST" });
  return (await parseJsonOrThrow(response)) as LinkCheckReport;
}

export interface AdminAnalyticsSettings {
  ga4_measurement_id: string;
  ga4_property_id: string;
  gsc_site_url: string;
  clarity_project_id: string;
  updated_at: string;
}

export type AnalyticsSettingsInput = Partial<Omit<AdminAnalyticsSettings, "updated_at">>;

export async function fetchAnalyticsSettings(): Promise<AdminAnalyticsSettings> {
  const response = await fetch("/api/admin/analytics/settings");
  const json = (await parseJsonOrThrow(response)) as { settings: AdminAnalyticsSettings };
  return json.settings;
}

export async function updateAnalyticsSettings(
  input: AnalyticsSettingsInput
): Promise<AdminAnalyticsSettings> {
  const response = await fetch("/api/admin/analytics/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { settings: AdminAnalyticsSettings };
  return json.settings;
}

// --- User Management -------------------------------------------------------
// Backs Admin → User Management: Users, Roles & Permissions, Banned Users,
// User Reports, User Verification, Login & Session Management, and User
// Activity Logs. See supabase/migrations/0012_user_management.sql.

export interface ViewerCapabilitiesDto {
  role: string;
  isAdmin: boolean;
  canBanUsers: boolean;
  canVerifyUsers: boolean;
  canManageReports: boolean;
  canViewActivityLogs: boolean;
  canModerateComments: boolean;
  canManageRoles: boolean;
  sessionManagementAvailable: boolean;
}

export interface AdminUserAuthInfo {
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  provider: string | null;
  isAnonymous: boolean;
  authBannedUntil: string | null;
}

export interface AdminUserRow {
  id: string;
  name: string;
  role: string;
  is_admin: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  ban_expires_at: string | null;
  is_verified: boolean;
  verified_at: string | null;
  created_at: string;
  auth: AdminUserAuthInfo | null;
}

export interface AdminUsersPage {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
  capabilities: ViewerCapabilitiesDto;
}

export async function fetchUsersAdmin(options: {
  page?: number;
  q?: string;
  role?: string;
  status?: "all" | "banned" | "verified" | "unverified";
}): Promise<AdminUsersPage> {
  const params = new URLSearchParams();
  params.set("page", String(options.page ?? 1));
  if (options.q) params.set("q", options.q);
  if (options.role) params.set("role", options.role);
  if (options.status) params.set("status", options.status);
  const response = await fetch(`/api/admin/users?${params.toString()}`);
  return (await parseJsonOrThrow(response)) as AdminUsersPage;
}

export async function updateUserRoleAdmin(id: string, role: string): Promise<AdminUserRow> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  const json = (await parseJsonOrThrow(response)) as { user: AdminUserRow };
  return json.user;
}

export async function banUserAdmin(
  id: string,
  input: { reason: string; expiresInDays?: number }
): Promise<AdminUserRow> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/ban`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { user: AdminUserRow };
  return json.user;
}

export async function unbanUserAdmin(id: string): Promise<AdminUserRow> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/ban`, { method: "DELETE" });
  const json = (await parseJsonOrThrow(response)) as { user: AdminUserRow };
  return json.user;
}

export async function verifyUserAdmin(id: string): Promise<AdminUserRow> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/verify`, { method: "POST" });
  const json = (await parseJsonOrThrow(response)) as { user: AdminUserRow };
  return json.user;
}

export async function unverifyUserAdmin(id: string): Promise<AdminUserRow> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/verify`, { method: "DELETE" });
  const json = (await parseJsonOrThrow(response)) as { user: AdminUserRow };
  return json.user;
}

export async function forceLogoutUserAdmin(id: string): Promise<void> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/force-logout`, { method: "POST" });
  await parseJsonOrThrow(response);
}

export interface ActivityLogRow {
  id: string;
  user_id: string;
  user_name?: string;
  activity_type: string;
  description: string;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function fetchUserActivityAdmin(
  id: string,
  page = 1
): Promise<{ activity: ActivityLogRow[]; total: number; page: number; pageSize: number }> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/activity?page=${page}`);
  return (await parseJsonOrThrow(response)) as {
    activity: ActivityLogRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export async function fetchGlobalActivityAdmin(options: {
  page?: number;
  userId?: string;
  activityType?: string;
}): Promise<{ activity: ActivityLogRow[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  params.set("page", String(options.page ?? 1));
  if (options.userId) params.set("userId", options.userId);
  if (options.activityType) params.set("activityType", options.activityType);
  const response = await fetch(`/api/admin/activity?${params.toString()}`);
  return (await parseJsonOrThrow(response)) as {
    activity: ActivityLogRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}

// --- Reports & Moderation ---------------------------------------------------
// Backs Admin → Reports & Moderation: User Reports, Report Categories,
// Report Queue, Report History, Copyright Requests, DMCA Requests,
// Counter-Notices, Copyright Claim History, Abuse/Spam/Harassment/
// Impersonation/Inappropriate-Content Reports, and Administration (status,
// assignment, moderator notes, actions taken, audit log). See
// supabase/migrations/0015_reports_moderation.sql. One table
// (`user_reports`) backs every one of these screens — each is just a
// different filter (kind/reason/category/status) over the same data, so
// there's a single ReportRow shape and a single set of fetch/update
// functions used throughout.

export type ReportKind = "user" | "copyright" | "dmca" | "counter_notice";
export type ReportStatus = "pending" | "reviewed" | "resolved" | "dismissed";
export type ReportPriority = "low" | "normal" | "high" | "urgent";
export type ReportActionType = "warning" | "remove_content" | "suspend_user" | "ban_user";

/** DB status values map to the admin's requested vocabulary: pending →
 * Open, reviewed → Under Review, resolved → Resolved, dismissed →
 * Rejected. Applied at this layer rather than renaming the stored enum —
 * see migration 0015 for why. */
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Open",
  reviewed: "Under Review",
  resolved: "Resolved",
  dismissed: "Rejected",
};

export interface ReportRow {
  id: string;
  kind: ReportKind;
  reporter_id: string | null;
  reporter_name: string;
  reported_user_id: string | null;
  reported_user_name: string | null;
  reason: string | null;
  details: string;
  context_game_slug: string | null;
  context_comment_id: string | null;
  category_key: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  assigned_moderator_id: string | null;
  assigned_moderator_name: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  claimant_name: string | null;
  claimant_email: string | null;
  copyrighted_work_description: string | null;
  infringing_url: string | null;
  sworn_statement: boolean;
  related_report_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchReportsAdmin(options: {
  page?: number;
  status?: "all" | "open" | "closed" | ReportStatus;
  kind?: "all" | "copyright_all" | ReportKind;
  reason?: string;
  categoryKey?: string;
  assignedTo?: string | "unassigned";
  q?: string;
}): Promise<{ reports: ReportRow[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  params.set("page", String(options.page ?? 1));
  if (options.status) params.set("status", options.status);
  if (options.kind) params.set("kind", options.kind);
  if (options.reason) params.set("reason", options.reason);
  if (options.categoryKey) params.set("categoryKey", options.categoryKey);
  if (options.assignedTo) params.set("assignedTo", options.assignedTo);
  if (options.q) params.set("q", options.q);
  const response = await fetch(`/api/admin/reports?${params.toString()}`);
  return (await parseJsonOrThrow(response)) as {
    reports: ReportRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export async function updateReportAdmin(
  id: string,
  patch: {
    status?: ReportStatus;
    assignedModeratorId?: string | null;
    priority?: ReportPriority;
    categoryKey?: string | null;
  }
): Promise<ReportRow> {
  const response = await fetch(`/api/admin/reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = (await parseJsonOrThrow(response)) as { report: ReportRow };
  return json.report;
}

export async function createReportAdmin(input: {
  kind: ReportKind;
  reason?: string;
  reportedUserId?: string;
  details?: string;
  contextGameSlug?: string;
  contextCommentId?: string;
  categoryKey?: string;
  priority?: ReportPriority;
  claimantName?: string;
  claimantEmail?: string;
  copyrightedWorkDescription?: string;
  infringingUrl?: string;
  swornStatement?: boolean;
  relatedReportId?: string;
}): Promise<ReportRow> {
  const response = await fetch("/api/admin/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { report: ReportRow };
  return json.report;
}

export interface ReportNoteRow {
  id: string;
  report_id: string;
  moderator_id: string | null;
  moderator_name: string;
  note: string;
  created_at: string;
}

export async function fetchReportNotesAdmin(reportId: string): Promise<ReportNoteRow[]> {
  const response = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}/notes`);
  const json = (await parseJsonOrThrow(response)) as { notes: ReportNoteRow[] };
  return json.notes;
}

export async function addReportNoteAdmin(reportId: string, note: string): Promise<ReportNoteRow> {
  const response = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  const json = (await parseJsonOrThrow(response)) as { note: ReportNoteRow };
  return json.note;
}

export interface ReportActionRow {
  id: string;
  report_id: string;
  action_type: ReportActionType;
  target_user_id: string | null;
  moderator_id: string | null;
  moderator_name: string;
  details: string;
  created_at: string;
}

export async function fetchReportActionsAdmin(reportId: string): Promise<ReportActionRow[]> {
  const response = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}/actions`);
  const json = (await parseJsonOrThrow(response)) as { actions: ReportActionRow[] };
  return json.actions;
}

export async function addReportActionAdmin(
  reportId: string,
  input: { actionType: ReportActionType; targetUserId?: string; details?: string; banExpiresInDays?: number }
): Promise<ReportActionRow> {
  const response = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { action: ReportActionRow };
  return json.action;
}

export interface ReportAuditEntryRow {
  id: string;
  report_id: string | null;
  actor_id: string | null;
  actor_name: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export async function fetchReportAuditAdmin(reportId: string): Promise<ReportAuditEntryRow[]> {
  const response = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}/audit`);
  const json = (await parseJsonOrThrow(response)) as { entries: ReportAuditEntryRow[] };
  return json.entries;
}

export async function fetchGlobalAuditLogAdmin(
  page = 1
): Promise<{ entries: ReportAuditEntryRow[]; total: number; page: number; pageSize: number }> {
  const response = await fetch(`/api/admin/audit-log?page=${page}`);
  return (await parseJsonOrThrow(response)) as {
    entries: ReportAuditEntryRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export interface ReportCategoryRow {
  id: string;
  key: string;
  label: string;
  group: "user" | "copyright" | "abuse";
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export async function fetchReportCategoriesAdmin(
  group?: "all" | "user" | "copyright" | "abuse"
): Promise<ReportCategoryRow[]> {
  const params = group && group !== "all" ? `?group=${group}` : "";
  const response = await fetch(`/api/admin/report-categories${params}`);
  const json = (await parseJsonOrThrow(response)) as { categories: ReportCategoryRow[] };
  return json.categories;
}

export async function createReportCategoryAdmin(input: {
  key: string;
  label: string;
  group: "user" | "copyright" | "abuse";
  description?: string;
  sortOrder?: number;
}): Promise<ReportCategoryRow> {
  const response = await fetch("/api/admin/report-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { category: ReportCategoryRow };
  return json.category;
}

export async function updateReportCategoryAdmin(
  id: string,
  patch: { label?: string; description?: string; sortOrder?: number; isActive?: boolean }
): Promise<ReportCategoryRow> {
  const response = await fetch(`/api/admin/report-categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = (await parseJsonOrThrow(response)) as { category: ReportCategoryRow };
  return json.category;
}

export async function deleteReportCategoryAdmin(id: string): Promise<void> {
  const response = await fetch(`/api/admin/report-categories/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}

export interface StaffMemberRow {
  id: string;
  name: string;
  role: string;
}

export async function fetchStaffListAdmin(): Promise<StaffMemberRow[]> {
  const response = await fetch("/api/admin/staff");
  const json = (await parseJsonOrThrow(response)) as { staff: StaffMemberRow[] };
  return json.staff;
}

export interface RolePermissionsMatrix {
  matrix: Record<string, string[]>;
  roles: string[];
  permissions: readonly string[];
}

export async function fetchRolePermissionsAdmin(): Promise<RolePermissionsMatrix> {
  const response = await fetch("/api/admin/roles");
  return (await parseJsonOrThrow(response)) as RolePermissionsMatrix;
}

export async function updateRolePermissionsAdmin(role: string, permissions: string[]): Promise<void> {
  const response = await fetch("/api/admin/roles", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, permissions }),
  });
  await parseJsonOrThrow(response);
}

export interface UserPermissionRow {
  permission: string;
  roleDefault: boolean;
  override: boolean | null;
  effective: boolean;
}

export async function fetchUserPermissionsAdmin(
  id: string
): Promise<{ role: string; permissions: UserPermissionRow[] }> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/permissions`);
  return (await parseJsonOrThrow(response)) as { role: string; permissions: UserPermissionRow[] };
}

export async function updateUserPermissionOverridesAdmin(
  id: string,
  overrides: { permission: string; granted: boolean | null }[]
): Promise<void> {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overrides }),
  });
  await parseJsonOrThrow(response);
}

// --- Localization --------------------------------------------------------
// Backs Admin → Localization: Languages, Currencies, Translations, Region
// Settings, and Advanced (auto-detection). All reads AND writes go through
// /api/admin/localization/* (same reasoning as SEO above — these are small
// admin-managed lists/singletons, not per-row RLS-scoped content).

export interface AdminLanguage {
  code: string;
  name: string;
  native_name: string;
  flag_emoji: string;
  is_rtl: boolean;
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type LanguageInput = Omit<AdminLanguage, "created_at" | "updated_at">;

export async function fetchLanguagesAdmin(): Promise<AdminLanguage[]> {
  const response = await fetch("/api/admin/localization/languages");
  const json = (await parseJsonOrThrow(response)) as { languages: AdminLanguage[] };
  return json.languages;
}

export async function createLanguage(input: LanguageInput): Promise<AdminLanguage> {
  const response = await fetch("/api/admin/localization/languages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { language: AdminLanguage };
  return json.language;
}

export async function updateLanguage(code: string, input: Partial<LanguageInput>): Promise<AdminLanguage> {
  const response = await fetch(`/api/admin/localization/languages/${encodeURIComponent(code)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { language: AdminLanguage };
  return json.language;
}

export async function deleteLanguage(code: string): Promise<void> {
  const response = await fetch(`/api/admin/localization/languages/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
  await parseJsonOrThrow(response);
}

export interface AdminCurrency {
  code: string;
  name: string;
  symbol: string;
  symbol_position: "before" | "after";
  decimal_separator: string;
  thousands_separator: string;
  decimal_places: number;
  exchange_rate: number;
  exchange_rate_mode: "automatic" | "manual";
  is_default: boolean;
  is_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CurrencyInput = Omit<AdminCurrency, "created_at" | "updated_at">;

export async function fetchCurrenciesAdmin(): Promise<AdminCurrency[]> {
  const response = await fetch("/api/admin/localization/currencies");
  const json = (await parseJsonOrThrow(response)) as { currencies: AdminCurrency[] };
  return json.currencies;
}

export async function createCurrency(input: CurrencyInput): Promise<AdminCurrency> {
  const response = await fetch("/api/admin/localization/currencies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { currency: AdminCurrency };
  return json.currency;
}

export async function updateCurrency(code: string, input: Partial<CurrencyInput>): Promise<AdminCurrency> {
  const response = await fetch(`/api/admin/localization/currencies/${encodeURIComponent(code)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { currency: AdminCurrency };
  return json.currency;
}

export async function deleteCurrency(code: string): Promise<void> {
  const response = await fetch(`/api/admin/localization/currencies/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
  await parseJsonOrThrow(response);
}

export type TranslationNamespace = "ui" | "menu" | "page" | "email" | "error";

export interface AdminTranslation {
  id: string;
  namespace: TranslationNamespace;
  key: string;
  language_code: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export async function fetchTranslationsAdmin(options: {
  namespace?: TranslationNamespace;
  languageCode?: string;
  q?: string;
}): Promise<AdminTranslation[]> {
  const params = new URLSearchParams();
  if (options.namespace) params.set("namespace", options.namespace);
  if (options.languageCode) params.set("languageCode", options.languageCode);
  if (options.q) params.set("q", options.q);
  const response = await fetch(`/api/admin/localization/translations?${params.toString()}`);
  const json = (await parseJsonOrThrow(response)) as { translations: AdminTranslation[] };
  return json.translations;
}

export async function upsertTranslation(input: {
  namespace: TranslationNamespace;
  key: string;
  language_code: string;
  value: string;
}): Promise<AdminTranslation> {
  const response = await fetch("/api/admin/localization/translations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { translation: AdminTranslation };
  return json.translation;
}

export async function deleteTranslationKey(namespace: TranslationNamespace, key: string): Promise<void> {
  const params = new URLSearchParams({ namespace, key });
  const response = await fetch(`/api/admin/localization/translations?${params.toString()}`, {
    method: "DELETE",
  });
  await parseJsonOrThrow(response);
}

export interface MissingTranslationReportRow {
  namespace: TranslationNamespace;
  key: string;
  missingLanguages: string[];
}

export async function fetchMissingTranslationsReport(): Promise<MissingTranslationReportRow[]> {
  const response = await fetch("/api/admin/localization/translations/missing-report");
  const json = (await parseJsonOrThrow(response)) as { missing: MissingTranslationReportRow[] };
  return json.missing;
}

export interface CurrencyByRegionRow {
  country_code: string;
  currency_code: string;
}
export interface RegionalContentRestrictionRow {
  country_code: string;
  restriction_type: "block" | "allow_only";
  note: string;
}
export interface CountryRedirectRow {
  country_code: string;
  redirect_path: string;
  is_active: boolean;
}

export interface AdminLocalizationSettings {
  default_country: string;
  default_region: string;
  timezone: string;
  date_format: string;
  time_format: "12h" | "24h";
  number_format: string;
  first_day_of_week: "sunday" | "monday" | "saturday";
  measurement_units: "metric" | "imperial";
  language_switcher_style: "dropdown" | "flags" | "list";
  language_switcher_enabled: boolean;
  auto_language_detection: boolean;
  auto_currency_detection: boolean;
  geo_ip_region_detection: boolean;
  currency_by_region: CurrencyByRegionRow[];
  regional_content_restrictions: RegionalContentRestrictionRow[];
  country_redirects: CountryRedirectRow[];
  regional_content_restrictions_enabled: boolean;
  country_redirects_enabled: boolean;
  updated_at: string;
}

export type LocalizationSettingsInput = Partial<Omit<AdminLocalizationSettings, "updated_at">>;

export async function fetchLocalizationSettings(): Promise<AdminLocalizationSettings> {
  const response = await fetch("/api/admin/localization/settings");
  const json = (await parseJsonOrThrow(response)) as { settings: AdminLocalizationSettings };
  return json.settings;
}

export async function updateLocalizationSettings(
  input: LocalizationSettingsInput
): Promise<AdminLocalizationSettings> {
  const response = await fetch("/api/admin/localization/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await parseJsonOrThrow(response)) as { settings: AdminLocalizationSettings };
  return json.settings;
}

// --- Mobile menu featured games -------------------------------------------

export interface MobileMenuGamePin {
  id: string;
  game_id: string;
  position: number;
  created_at: string;
}

/** All pinned mobile-menu games in position order (publicly readable table —
 * direct Supabase read, same pattern as fetchHomepageSectionGamePins). */
export async function fetchMobileMenuGamePins(): Promise<MobileMenuGamePin[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("mobile_menu_games")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Pins a game to the mobile menu featured row (POST /api/admin/mobile/games). */
export async function addMobileMenuGame(gameId: string): Promise<void> {
  const response = await fetch("/api/admin/mobile/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId }),
  });
  await parseJsonOrThrow(response);
}

/** Removes a game from the mobile menu featured row. */
export async function removeMobileMenuGame(gameId: string): Promise<void> {
  const response = await fetch("/api/admin/mobile/games", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_id: gameId }),
  });
  await parseJsonOrThrow(response);
}

/** Rewrites the display order of all pinned mobile-menu games. */
export async function reorderMobileMenuGames(gameIds: string[]): Promise<void> {
  const response = await fetch("/api/admin/mobile/games/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gameIds }),
  });
  await parseJsonOrThrow(response);
}

// --- Reviews Moderation ---------------------------------------------------
// Backs Admin → Reviews: all reviews across every game, with game-slug
// filter, free-text search, star-rating range, pagination, and delete.

export interface AdminReview {
  id: string;
  gameSlug: string;
  gameTitle: string;
  authorId: string;
  authorName: string;
  rating: number;
  reviewText: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReviewsPage {
  reviews: AdminReview[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchReviewsAdmin(options: {
  page?: number;
  gameSlug?: string;
  q?: string;
  minRating?: number;
  maxRating?: number;
}): Promise<AdminReviewsPage> {
  const params = new URLSearchParams();
  params.set("page", String(options.page ?? 1));
  if (options.gameSlug) params.set("gameSlug", options.gameSlug);
  if (options.q) params.set("q", options.q);
  if (options.minRating !== undefined) params.set("minRating", String(options.minRating));
  if (options.maxRating !== undefined) params.set("maxRating", String(options.maxRating));

  const response = await fetch(`/api/admin/reviews?${params.toString()}`);
  return (await parseJsonOrThrow(response)) as AdminReviewsPage;
}

export async function deleteReviewAdmin(id: string): Promise<void> {
  const response = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}`, { method: "DELETE" });
  await parseJsonOrThrow(response);
}
