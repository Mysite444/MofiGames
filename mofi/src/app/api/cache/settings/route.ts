import { NextResponse, type NextRequest } from "next/server";
import { publicClient, requireAdmin } from "@/lib/supabase/route-auth";
import { cacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation";

/** GET /api/cache/settings — the cache_settings row. Deliberately
 * unauthenticated: the browser-side upload helpers (uploadThumbnail,
 * uploadContentImage, etc. in admin-content.ts) need this to pick a
 * Cache-Control duration, and src/app/sw.js/route.ts needs
 * service_worker_enabled on every first-visit page load, long before
 * any admin session exists. */
export async function GET() {
  const supabase = await publicClient();
  const { data } = await supabase.from("cache_settings").select("*").eq("id", true).maybeSingle();
  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/cache/settings — Admin → Cache → Browser Cache. Admin-only. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = cacheSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
  if (input.contentImagesMaxAge !== undefined) patch.content_images_max_age = input.contentImagesMaxAge;
  if (input.gameThumbnailsMaxAge !== undefined) patch.game_thumbnails_max_age = input.gameThumbnailsMaxAge;
  if (input.gameMediaMaxAge !== undefined) patch.game_media_max_age = input.gameMediaMaxAge;
  if (input.mediaLibraryMaxAge !== undefined) patch.media_library_max_age = input.mediaLibraryMaxAge;
  if (input.gameFilesMaxAge !== undefined) patch.game_files_max_age = input.gameFilesMaxAge;
  if (input.serviceWorkerEnabled !== undefined) patch.service_worker_enabled = input.serviceWorkerEnabled;
  if (input.serviceWorkerCacheVersion !== undefined)
    patch.service_worker_cache_version = input.serviceWorkerCacheVersion;

  const { data, error } = await supabase
    .from("cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
