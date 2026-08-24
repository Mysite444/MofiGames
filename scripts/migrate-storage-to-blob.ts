// One-time migration: copies every file already sitting in Supabase
// Storage — from back when uploads went there — into Vercel Blob at the
// same pathname, then rewrites every DB column that stores one of those
// files' public URL so the live site (and admin panel) point at the new
// location instead.
//
// Covers the same five buckets the app itself moved off Supabase for:
// game-thumbnails, game-media, game-files, content-images, media-library.
// (automation-backups / content-backups / site-migrations are the
// separate backup/DR system and were never in scope for that move, so
// this script doesn't touch them either.)
//
// Safe to re-run:
//   - File copies are skipped once the same Blob pathname already exists
//     (pass --force to re-copy and overwrite anyway).
//   - DB updates only ever touch rows whose column still contains an old
//     Supabase Storage URL for one of these buckets — a row already
//     migrated is simply left alone on a second run.
//
// Nothing is ever deleted from Supabase Storage. This only copies files
// forward and repoints the DB at them; once you've spot-checked the site
// on the new URLs, cleaning up the old Supabase buckets is a separate,
// manual step (Supabase Dashboard → Storage), whenever you're ready.
//
// Defaults to a dry run — reports exactly what it *would* copy and
// update without changing anything. Add --commit to actually do it.
//
// Usage:
//   npx tsx scripts/migrate-storage-to-blob.ts                  # dry run
//   npx tsx scripts/migrate-storage-to-blob.ts --commit          # copy files + update DB
//   npx tsx scripts/migrate-storage-to-blob.ts --commit --force  # also re-copy files already in Blob
//
// Requires, in .env.local or the environment:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   — Supabase Dashboard → Project Settings → API → service_role.
//                                 Needed to read every file regardless of RLS and to update
//                                 every row across tables; the anon key can't do either.
//   BLOB_READ_WRITE_TOKEN       — Vercel Dashboard → Storage → your Blob store → .env.local tab
//   NEXT_PUBLIC_BLOB_BASE_URL   — same place, the store's public base URL

import { createClient } from "@supabase/supabase-js";
import { put, head } from "@vercel/blob";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal(): void {
  // Same best-effort .env.local loader as generate-static-fallback.ts —
  // duplicated rather than imported since these are both standalone
  // scripts run outside any Next.js context. CI/Vercel already inject
  // real env vars, so a missing .env.local there is a non-issue.
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const COMMIT = process.argv.includes("--commit");
const FORCE = process.argv.includes("--force");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE_URL = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !BLOB_TOKEN || !BLOB_BASE_URL) {
  console.error(
    "Missing one of NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BLOB_READ_WRITE_TOKEN, " +
      "NEXT_PUBLIC_BLOB_BASE_URL. Fill these in in .env.local (see the comments at the top of this file) " +
      "and try again."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKETS = ["game-thumbnails", "game-media", "game-files", "content-images", "media-library"] as const;
type Bucket = (typeof BUCKETS)[number];

// Every DB column, across every table, known to store one of these
// buckets' public URLs — see PostsAdminClient / GamesAdminClient /
// SiteIdentityAdminClient / MediaAdminClient for where each is set.
// games.storage_path is deliberately NOT listed here: it's a bucket-
// relative path, not a full URL (e.g. "some-slug/index.html"), so it's
// already correct once the underlying files are copied — nothing to
// rewrite.
const URL_COLUMNS: { table: string; column: string; bucket: Bucket }[] = [
  { table: "games", column: "thumbnail_url", bucket: "game-thumbnails" },
  { table: "games", column: "cover_image_url", bucket: "game-media" },
  { table: "games", column: "video_trailer_url", bucket: "game-media" },
  { table: "games", column: "preview_video_url", bucket: "game-media" },
  { table: "games", column: "loading_screen_url", bucket: "game-media" },
  { table: "posts", column: "cover_image_url", bucket: "content-images" },
  { table: "site_identity", column: "logo_url", bucket: "media-library" },
  { table: "site_identity", column: "favicon_url", bucket: "media-library" },
  { table: "site_identity", column: "favicon_16_url", bucket: "media-library" },
  { table: "site_identity", column: "favicon_32_url", bucket: "media-library" },
  { table: "site_identity", column: "favicon_svg_url", bucket: "media-library" },
  { table: "site_identity", column: "apple_touch_icon_url", bucket: "media-library" },
  { table: "site_identity", column: "icon_192_url", bucket: "media-library" },
  { table: "site_identity", column: "icon_512_url", bucket: "media-library" },
  { table: "media_assets", column: "url", bucket: "media-library" },
];

function supabasePublicUrlPrefix(bucket: Bucket): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
}
function blobUrlPrefix(bucket: Bucket): string {
  return `${BLOB_BASE_URL!.replace(/\/+$/, "")}/${bucket}/`;
}

// --- Phase 1: copy every file from each Supabase bucket into Blob -----

interface StorageEntry {
  id: string | null;
  name: string;
}

/** Supabase Storage's `.list()` is one folder level at a time (folders
 * come back as entries with `id: null`) — walk it depth-first to get
 * every file's full path, the same shape Vercel Blob's flat `list()`
 * already returns natively. */
async function listAllFiles(bucket: Bucket, prefix = ""): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);

  const files: string[] = [];
  for (const entry of (data ?? []) as StorageEntry[]) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      files.push(...(await listAllFiles(bucket, fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

interface CopyStats {
  copied: number;
  skippedExisting: number;
  failed: number;
}

async function copyBucket(bucket: Bucket): Promise<CopyStats> {
  const stats: CopyStats = { copied: 0, skippedExisting: 0, failed: 0 };
  const files = await listAllFiles(bucket);
  console.log(`  ${bucket}: ${files.length} file(s) found in Supabase Storage`);

  for (const filePath of files) {
    const blobPathname = `${bucket}/${filePath}`;

    if (!FORCE) {
      const exists = await head(blobPathname, { token: BLOB_TOKEN }).catch(() => null);
      if (exists) {
        stats.skippedExisting++;
        continue;
      }
    }

    if (!COMMIT) {
      stats.copied++;
      continue;
    }

    try {
      const { data, error } = await supabase.storage.from(bucket).download(filePath);
      if (error || !data) throw new Error(error?.message ?? "empty download");
      await put(blobPathname, data, {
        access: "public",
        token: BLOB_TOKEN,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: data.type || undefined,
      });
      stats.copied++;
    } catch (err) {
      stats.failed++;
      console.error(`    ✗ ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return stats;
}

// --- Phase 2: repoint DB rows at the new Blob URLs ---------------------

interface RewriteStats {
  table: string;
  column: string;
  matched: number;
  updated: number;
}

async function rewriteColumn(table: string, column: string, bucket: Bucket): Promise<RewriteStats> {
  const oldPrefix = supabasePublicUrlPrefix(bucket);
  const newPrefix = blobUrlPrefix(bucket);

  const { data, error } = await supabase
    .from(table)
    .select("id, " + column)
    .like(column, `${oldPrefix}%`);
  if (error) throw new Error(`select ${table}.${column}: ${error.message}`);

  const rows = (data ?? []) as unknown as { id: string; [key: string]: unknown }[];
  const stats: RewriteStats = { table, column, matched: rows.length, updated: 0 };
  if (rows.length === 0 || !COMMIT) return stats;

  for (const row of rows) {
    const oldValue = row[column] as string;
    const newValue = oldValue.replace(oldPrefix, newPrefix);
    const { error: updateError } = await supabase.from(table).update({ [column]: newValue }).eq("id", row.id);
    if (updateError) {
      console.error(`    ✗ ${table}.${column} id=${row.id}: ${updateError.message}`);
      continue;
    }
    stats.updated++;
  }

  return stats;
}

// --- Run -----------------------------------------------------------------

async function main() {
  console.log(COMMIT ? "Running for real (--commit set).\n" : "DRY RUN — pass --commit to actually copy/update.\n");

  console.log("Copying files: Supabase Storage → Vercel Blob");
  const copyResults: Record<string, CopyStats> = {};
  for (const bucket of BUCKETS) {
    copyResults[bucket] = await copyBucket(bucket);
  }

  console.log("\nRewriting DB URLs: Supabase Storage → Vercel Blob");
  const rewriteResults: RewriteStats[] = [];
  for (const { table, column, bucket } of URL_COLUMNS) {
    const result = await rewriteColumn(table, column, bucket);
    if (result.matched > 0) {
      rewriteResults.push(result);
      console.log(
        `  ${table}.${column}: ${result.matched} row(s) matched` +
          (COMMIT ? `, ${result.updated} updated` : " (dry run, none updated)")
      );
    }
  }

  console.log("\n--- Summary -------------------------------------------");
  for (const bucket of BUCKETS) {
    const s = copyResults[bucket];
    console.log(
      `${bucket}: ${s.copied} copied, ${s.skippedExisting} already in Blob (skipped)` +
        (s.failed ? `, ${s.failed} FAILED` : "")
    );
  }
  if (rewriteResults.length === 0) {
    console.log("No DB rows referenced an old Supabase Storage URL for these buckets.");
  }
  const anyFailed = Object.values(copyResults).some((s) => s.failed > 0);
  if (!COMMIT) {
    console.log("\nThis was a dry run — nothing was copied or changed. Re-run with --commit to apply.");
  } else if (anyFailed) {
    console.log("\nFinished with some failures above — safe to re-run, already-copied files will be skipped.");
  } else {
    console.log(
      "\nDone. Spot-check the site on the new URLs, then clean up the old Supabase buckets yourself whenever ready."
    );
  }
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nMigration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
