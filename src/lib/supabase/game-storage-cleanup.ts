import type { SupabaseClient } from "@supabase/supabase-js";
import { list, del } from "@vercel/blob";

// Cleans up every Vercel Blob object tied to a game record. Used by
// DELETE /api/admin/games/:id so removing a game doesn't leave orphaned
// files behind under the game-thumbnails / game-media / game-files
// pathname prefixes (Blob's flat namespace plays the same "bucket" role
// Supabase Storage buckets used to).
//
// Why paths are parsed from the stored URLs/storage_path instead of
// reconstructed from the game's current slug: the admin can rename a
// game's slug (PATCH) without re-uploading its media, so "current slug"
// and "the folder the files actually live in" can diverge. Reading the
// path back out of whatever the DB already points to is correct
// regardless of renames; guessing from the current slug is not.

// Vercel Blob's del() accepts a batch of paths per call; keep well under
// any provider-side limit and to bound single-request size.
const REMOVE_BATCH_SIZE = 100;
const LIST_PAGE_SIZE = 1000;

/** Pulls the bucket-relative path out of a public Vercel Blob URL, e.g.
 * "https://abc123.public.blob.vercel-storage.com/game-media/some-slug/
 * cover-1.png" -> "some-slug/cover-1.png". Returns null for anything
 * that isn't a blob URL under that bucket prefix (null/empty field,
 * external URL, etc.) so callers can safely skip it. */
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

/** Lists every blob pathname under `${bucket}/${prefix}`, stripped back
 * down to its bucket-relative path — Vercel Blob's `list()` is already
 * flat and paginated via a cursor (unlike Supabase Storage's folder-by-
 * folder `.list()`, this needs no manual breadth-first walk).
 *
 * `maxObjects` bounds the walk (default unbounded, used when scoped to
 * one game's build folder — that's never going to be huge). The
 * whole-bucket orphan scan below passes an explicit cap so a bucket with
 * an enormous number of objects can't hang an admin request; hitting the
 * cap is reported via `truncated`, never silent. */
async function listAllUnderPrefix(
  bucket: string,
  prefix: string,
  maxObjects = Infinity
): Promise<{ paths: string[]; truncated: boolean }> {
  const paths: string[] = [];
  const blobPrefix = prefix ? `${bucket}/${prefix}` : `${bucket}/`;
  let cursor: string | undefined;
  let truncated = false;

  do {
    const result = await list({ prefix: blobPrefix, cursor, limit: LIST_PAGE_SIZE });
    for (const blob of result.blobs) {
      paths.push(blob.pathname.slice(bucket.length + 1));
      if (paths.length >= maxObjects) {
        truncated = true;
        break;
      }
    }
    cursor = result.hasMore ? result.cursor : undefined;
  } while (cursor && !truncated);

  return { paths, truncated };
}

async function removeInBatches(bucket: string, paths: string[], errors: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  let removed = 0;
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REMOVE_BATCH_SIZE).map((p) => `${bucket}/${p}`);
    try {
      await del(batch);
      removed += batch.length;
    } catch (err) {
      errors.push(`${bucket}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return removed;
}

export interface GameMediaRefs {
  thumbnail_url: string | null;
  cover_image_url: string | null;
  video_trailer_url: string | null;
  preview_video_url: string | null;
  loading_screen_url: string | null;
  storage_path: string | null;
}

export interface GameStorageCleanupResult {
  removed: number;
  errors: string[];
}

/** Deletes every Blob object belonging to one game: thumbnail, cover
 * image, trailer, preview video, loading screen (all single files), and —
 * for an uploaded build — every file under the build's folder, not just
 * the entry file recorded in `storage_path`.
 *
 * Best-effort by design: a failure removing one file/bucket doesn't stop
 * the rest from being attempted, and nothing here throws. Storage cleanup
 * is a secondary effect of deleting a game — a transient Storage error
 * should never be the reason a game delete appears to fail. Callers
 * should fetch `game` *before* deleting the DB row, then call this after
 * (see DELETE /api/admin/games/:id), logging `errors` for follow-up.
 *
 * `_supabase` is accepted (and unused) for call-site compatibility with
 * the DB row read that happens right before this — this module itself
 * only ever touches Vercel Blob now. */
export async function deleteGameStorageFiles(
  _supabase: SupabaseClient,
  game: GameMediaRefs
): Promise<GameStorageCleanupResult> {
  const errors: string[] = [];
  let removed = 0;

  // Thumbnail — single file, exact path parsed from its public URL.
  const thumbnailPath = pathFromBlobUrl(game.thumbnail_url, "game-thumbnails");
  if (thumbnailPath) {
    removed += await removeInBatches("game-thumbnails", [thumbnailPath], errors);
  }

  // Cover image / trailer / preview video / loading screen share the
  // game-media bucket — one batched remove() call for all of them.
  const mediaPaths = [
    pathFromBlobUrl(game.cover_image_url, "game-media"),
    pathFromBlobUrl(game.video_trailer_url, "game-media"),
    pathFromBlobUrl(game.preview_video_url, "game-media"),
    pathFromBlobUrl(game.loading_screen_url, "game-media"),
  ].filter((p): p is string => Boolean(p));
  if (mediaPaths.length > 0) {
    removed += await removeInBatches("game-media", mediaPaths, errors);
  }

  // Uploaded game build (play_type: "upload"). storage_path only records
  // the entry file, e.g. "{slug-at-upload-time}/index.html" — the build
  // itself can be dozens of files across subfolders (assets/, etc). Its
  // first path segment is the build's folder, so walk everything under
  // that and remove it all.
  if (game.storage_path) {
    const buildFolder = game.storage_path.split("/")[0];
    if (buildFolder) {
      try {
        const { paths: buildPaths } = await listAllUnderPrefix("game-files", `${buildFolder}/`);
        removed += await removeInBatches("game-files", buildPaths, errors);
      } catch (err) {
        errors.push(`game-files: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { removed, errors };
}

// ---------------------------------------------------------------------------
// Orphan scan/cleanup — finds and removes Storage objects that no longer
// have a game row pointing at them. This is the general-purpose sweep for
// files that were *already* leaked before the delete-time cleanup above
// existed, or from editing a game's media (uploads are timestamped, so
// replacing a thumbnail/cover/etc. leaves the previous file behind under
// its old, now-unreferenced path).
// ---------------------------------------------------------------------------

const GAME_BUCKETS = ["game-thumbnails", "game-media", "game-files"] as const;
export type GameBucket = (typeof GAME_BUCKETS)[number];

// Ceiling per bucket for the whole-bucket scan, mirroring
// MAX_OBJECTS_PER_BUCKET in lib/backup/storage-inventory.ts. If a bucket
// has more objects than this, the scan still runs and still deletes
// whatever orphans it *did* find (those are correctly identified
// regardless of what else exists) — `truncated` just means a re-run may
// find more.
const MAX_SCAN_OBJECTS_PER_BUCKET = 20_000;

export interface OrphanBucketScan {
  scanned: number;
  orphanPaths: string[];
  truncated: boolean;
}

export interface OrphanScanResult {
  buckets: Record<GameBucket, OrphanBucketScan>;
  errors: string[];
}

const GAME_SELECT_COLUMNS =
  "thumbnail_url, cover_image_url, video_trailer_url, preview_video_url, loading_screen_url, storage_path";

interface GameMediaRow {
  thumbnail_url: string | null;
  cover_image_url: string | null;
  video_trailer_url: string | null;
  preview_video_url: string | null;
  loading_screen_url: string | null;
  storage_path: string | null;
}

/** Scans game-thumbnails / game-media / game-files for every object that
 * no row in `games` currently references, WITHOUT deleting anything —
 * safe to call as a preview. Reads every game row (not just one), so this
 * is the right tool for "clean up whatever's already been leaked", as
 * opposed to deleteGameStorageFiles() which only ever looks at one game
 * being deleted right now. */
export async function scanOrphanedGameMedia(supabase: SupabaseClient): Promise<OrphanScanResult> {
  const errors: string[] = [];

  const { data: games, error: gamesError } = await supabase.from("games").select(GAME_SELECT_COLUMNS);
  if (gamesError) {
    errors.push(`games: ${gamesError.message}`);
  }
  const rows = (games ?? []) as GameMediaRow[];

  const referencedThumbnails = new Set<string>();
  const referencedMedia = new Set<string>();
  const referencedBuildFolders = new Set<string>();

  for (const g of rows) {
    const thumb = pathFromBlobUrl(g.thumbnail_url, "game-thumbnails");
    if (thumb) referencedThumbnails.add(thumb);

    for (const url of [g.cover_image_url, g.video_trailer_url, g.preview_video_url, g.loading_screen_url]) {
      const p = pathFromBlobUrl(url, "game-media");
      if (p) referencedMedia.add(p);
    }

    // Whole build folders are "referenced" as a unit — every file under
    // a live game's build folder is legitimate, not just the entry file
    // storage_path happens to point at.
    if (g.storage_path) {
      const folder = g.storage_path.split("/")[0];
      if (folder) referencedBuildFolders.add(folder);
    }
  }

  const buckets = {} as Record<GameBucket, OrphanBucketScan>;

  for (const bucket of GAME_BUCKETS) {
    try {
      const { paths, truncated } = await listAllUnderPrefix(bucket, "", MAX_SCAN_OBJECTS_PER_BUCKET);
      const orphanPaths =
        bucket === "game-files"
          ? paths.filter((p) => {
              const folder = p.split("/")[0];
              return !folder || !referencedBuildFolders.has(folder);
            })
          : paths.filter((p) => !(bucket === "game-thumbnails" ? referencedThumbnails : referencedMedia).has(p));
      buckets[bucket] = { scanned: paths.length, orphanPaths, truncated };
    } catch (err) {
      errors.push(`${bucket}: ${err instanceof Error ? err.message : String(err)}`);
      buckets[bucket] = { scanned: 0, orphanPaths: [], truncated: false };
    }
  }

  return { buckets, errors };
}

export interface OrphanCleanupResult {
  deletedCounts: Record<GameBucket, number>;
  truncated: Record<GameBucket, boolean>;
  errors: string[];
}

/** Finds and deletes every orphaned object across game-thumbnails /
 * game-media / game-files. Always re-scans internally right before
 * deleting rather than accepting a caller-supplied list — a preview scan
 * and the actual delete can be seconds or minutes apart in the admin UI,
 * and a game's media could legitimately change in that window. Acting on
 * a fresh scan means this can never delete a file a concurrent upload
 * just created. */
export async function deleteOrphanedGameMedia(supabase: SupabaseClient): Promise<OrphanCleanupResult> {
  const scan = await scanOrphanedGameMedia(supabase);
  const errors = [...scan.errors];
  const deletedCounts = {} as Record<GameBucket, number>;
  const truncated = {} as Record<GameBucket, boolean>;

  for (const bucket of GAME_BUCKETS) {
    deletedCounts[bucket] = await removeInBatches(bucket, scan.buckets[bucket].orphanPaths, errors);
    truncated[bucket] = scan.buckets[bucket].truncated;
  }

  return { deletedCounts, truncated, errors };
}
