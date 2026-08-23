import { NextResponse, type NextRequest } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiError } from "@/lib/api-error";
import { CACHE_MAX_AGE_LIMITS, type CacheSettings } from "@/lib/cache-settings";
import { MEDIA_UPLOAD_RULES } from "@/lib/file-validation";
import type { MediaCategory } from "@/lib/supabase/admin-content";

// POST /api/admin/blob/upload — admin only. Authorizes every direct-to-
// Vercel-Blob upload from the admin panel (game thumbnails, game media,
// game builds, blog/page content images, and the Media Library).
//
// Mirrors the RLS-gated direct-to-Supabase-Storage uploads this replaced:
// the browser never gets a long-lived credential, only a short client
// token scoped to one exact pathname, minted here after requireAdmin()
// passes. See src/lib/supabase/admin-content.ts for the five upload
// helpers that call this route via @vercel/blob/client's `upload()`.
//
// This route only ever receives the 'blob.generate-client-token' event.
// handleUpload's other event, 'blob.upload-completed', is a server-to-
// server webhook Vercel calls *after* onBeforeGenerateToken sets a
// callbackUrl (via onUploadCompleted below) — we don't set one, since
// every caller already knows the finished blob's URL from `upload()`'s
// return value and persists it itself (e.g. uploadMediaAsset's
// media_assets insert). That keeps requireAdmin() safe to check
// unconditionally: this route is never called by anything but an
// authenticated admin's browser.

type BucketName = "game-thumbnails" | "game-media" | "game-files" | "content-images" | "media-library";

const BUCKETS: Record<
  BucketName,
  { cacheKey: keyof CacheSettings & keyof typeof CACHE_MAX_AGE_LIMITS; maxBytes: number; allowedContentTypes?: string[] }
> = {
  "game-thumbnails": { cacheKey: "gameThumbnailsMaxAge", maxBytes: 15 * 1024 * 1024, allowedContentTypes: ["image/*"] },
  "game-media": { cacheKey: "gameMediaMaxAge", maxBytes: 200 * 1024 * 1024, allowedContentTypes: ["image/*", "video/*"] },
  // Build files can be nearly anything (html/js/css/wasm/fonts/images) —
  // no MIME restriction, just a generous per-file size ceiling.
  "game-files": { cacheKey: "gameFilesMaxAge", maxBytes: 50 * 1024 * 1024 },
  "content-images": { cacheKey: "contentImagesMaxAge", maxBytes: 15 * 1024 * 1024, allowedContentTypes: ["image/*"] },
  // Refined per-category below using the same MEDIA_UPLOAD_RULES the
  // client already checks against in file-validation.ts.
  "media-library": { cacheKey: "mediaLibraryMaxAge", maxBytes: 100 * 1024 * 1024 },
};

interface UploadClientPayload {
  bucket?: string;
  cacheControlMaxAgeSeconds?: number;
}

function clampCacheMaxAge(cacheKey: keyof typeof CACHE_MAX_AGE_LIMITS, requested: unknown): number {
  const { min, max } = CACHE_MAX_AGE_LIMITS[cacheKey];
  const value = Number(requested);
  if (!Number.isFinite(value)) return max;
  return Math.min(max, Math.max(min, value));
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return apiError(new Error("Malformed request body"), "Invalid request.", 400);
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayloadRaw) => {
        // Pathnames are always "{bucket}/...rest" — reject anything that
        // doesn't match one of the five known buckets or tries to escape
        // its own folder.
        const bucket = pathname.split("/", 1)[0] as BucketName;
        const config = BUCKETS[bucket];
        if (!config || pathname.includes("..") || pathname.length <= bucket.length + 1) {
          throw new Error("Invalid upload path.");
        }

        let payload: UploadClientPayload = {};
        try {
          payload = clientPayloadRaw ? (JSON.parse(clientPayloadRaw) as UploadClientPayload) : {};
        } catch {
          // Malformed payload — fall through to bucket defaults below.
        }
        if (payload.bucket !== bucket) {
          throw new Error("Upload path does not match its declared bucket.");
        }

        let maximumSizeInBytes = config.maxBytes;
        let allowedContentTypes = config.allowedContentTypes;
        if (bucket === "media-library") {
          const category = pathname.split("/")[1] as MediaCategory | undefined;
          const rule = category ? MEDIA_UPLOAD_RULES[category] : undefined;
          if (rule) {
            maximumSizeInBytes = rule.maxBytes;
            allowedContentTypes = rule.mimeTypes;
          }
        }

        return {
          allowedContentTypes,
          maximumSizeInBytes,
          // We stamp uniqueness into the pathname ourselves (timestamps /
          // uuids — see admin-content.ts), and game-files intentionally
          // re-uploads to the *same* pathname on every rebuild — so
          // Vercel Blob's own suffixing would break both cases.
          addRandomSuffix: false,
          allowOverwrite: true,
          cacheControlMaxAge: clampCacheMaxAge(config.cacheKey, payload.cacheControlMaxAgeSeconds),
        };
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    return apiError(err, "Could not authorize upload.", 400);
  }
}
