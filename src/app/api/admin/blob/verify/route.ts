import { NextResponse, type NextRequest } from "next/server";
import { del } from "@vercel/blob";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiError } from "@/lib/api-error";
import { isMagicBytesValid, groupForBucket, type MagicByteGroup } from "@/lib/magic-bytes";

/**
 * POST /api/admin/blob/verify
 *
 * L-1 fix (2026-09 security audit): adds server-side magic-byte validation
 * for media uploads.
 *
 * Background: Vercel Blob's direct-upload flow works as:
 *   1. Browser → /api/admin/blob/upload  (mints a short-lived client token)
 *   2. Browser → Vercel Blob CDN         (direct upload; server never sees bytes)
 *   3. Browser ← blob URL               (returned by @vercel/blob/client upload())
 *
 * Because the server never handles the file bytes in step 2, content-type
 * enforcement in step 1 (allowedContentTypes) trusts the client-declared
 * Content-Type header.  A compromised admin could upload an HTML or PHP
 * polyglot with MIME "image/jpeg".
 *
 * This endpoint receives the blob URL right after step 3, fetches only the
 * first 16 bytes via an HTTP Range request, checks the magic bytes against
 * the bucket's expected MIME group, and:
 *   • If VALID  → returns { ok: true, detectedMime }
 *   • If INVALID → calls del(url) to remove the blob from Vercel Blob storage,
 *                  then returns 422 so the caller knows the upload was rejected.
 *
 * The upload helpers (uploadThumbnail, uploadGameMedia, uploadContentImage,
 * uploadMediaAsset) in admin-content.ts call this endpoint after every
 * upload that lands in an image/video/icon/gif bucket.  "game-files" is
 * excluded — HTML5 game builds contain mixed content with no coherent
 * magic-byte fingerprint.
 *
 * Security note: a malicious admin who controls both the client code AND the
 * server-side admin credentials could skip calling this endpoint entirely.
 * The mitigation is admin-only access + Vercel Blob's separate CDN origin
 * (files can't run scripts in the main app's origin even if mislabeled).
 * This check raises the bar above "any admin can host arbitrary content under
 * the site's blob subdomain."
 */

const bodySchema = z.object({
  /** Vercel Blob URL of the just-uploaded file. */
  url: z.string().url(),
  /** Storage bucket the file was uploaded into. */
  bucket: z.string().min(1).max(64),
  /** media-library category (e.g. "image", "icon", "gif") — only relevant
   *  when bucket is "media-library". */
  category: z.string().optional(),
});

// Number of bytes to fetch — 16 covers all magic-byte signatures we check.
const MAGIC_BYTES_LENGTH = 16;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { url, bucket, category } = parsed.data;

  // Resolve the MagicByteGroup for this bucket/category.
  const group: MagicByteGroup = groupForBucket(bucket, category);

  // "skip" means the bucket is intentionally permissive (game-files, audio …)
  if (group === "skip") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Fetch only the first MAGIC_BYTES_LENGTH bytes via HTTP Range.
  let buf: Buffer;
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${MAGIC_BYTES_LENGTH - 1}` },
    });
    // Blob CDN returns 206 Partial Content for range requests; also accept
    // 200 in case the CDN doesn't support Range (we'll still read the head).
    if (!res.ok && res.status !== 206) {
      throw new Error(`Blob fetch returned ${res.status}`);
    }
    buf = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    // If we can't fetch the blob (e.g. just-uploaded, CDN propagation delay),
    // fail open — a transient network issue must not delete a valid upload.
    console.error("[blob/verify] Could not fetch blob for magic-byte check:", err);
    return NextResponse.json({ ok: true, skipped: true, reason: "fetch_failed" });
  }

  const valid = isMagicBytesValid(buf, group);

  if (!valid) {
    // Delete the invalid blob from Vercel Blob storage so it can't be hosted.
    try {
      await del(url);
    } catch (delErr) {
      // Log but don't surface — the 422 response is still the right answer.
      console.error("[blob/verify] del() failed after magic-byte rejection:", delErr);
    }
    return NextResponse.json(
      {
        ok: false,
        error: "The file's actual content does not match its declared type. Upload rejected.",
      },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true });
}
