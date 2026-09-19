import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mediaCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation-media-cache";

/** GET /api/admin/cache/media/settings
 * Admin-only. Loads the singleton media_cache_settings row. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("media_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load Media Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/media/settings
 * Admin-only. Validates and merges a partial update into the singleton row. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = mediaCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  // Master
  if (input.enabled !== undefined) patch.enabled = input.enabled;

  // Videos
  if (input.videosEnabled              !== undefined) patch.videos_enabled               = input.videosEnabled;
  if (input.videosCacheTtlSeconds      !== undefined) patch.videos_cache_ttl_seconds     = input.videosCacheTtlSeconds;
  if (input.videosSwrSeconds           !== undefined) patch.videos_swr_seconds           = input.videosSwrSeconds;
  if (input.videosRangeRequestsEnabled !== undefined) patch.videos_range_requests_enabled = input.videosRangeRequestsEnabled;
  if (input.videosCdnOffloadEnabled    !== undefined) patch.videos_cdn_offload_enabled   = input.videosCdnOffloadEnabled;
  if (input.videosMaxFileSizeMb        !== undefined) patch.videos_max_file_size_mb      = input.videosMaxFileSizeMb;

  // Audio
  if (input.audioEnabled               !== undefined) patch.audio_enabled                = input.audioEnabled;
  if (input.audioCacheTtlSeconds       !== undefined) patch.audio_cache_ttl_seconds      = input.audioCacheTtlSeconds;
  if (input.audioSwrSeconds            !== undefined) patch.audio_swr_seconds            = input.audioSwrSeconds;
  if (input.audioRangeRequestsEnabled  !== undefined) patch.audio_range_requests_enabled = input.audioRangeRequestsEnabled;
  if (input.audioCdnOffloadEnabled     !== undefined) patch.audio_cdn_offload_enabled    = input.audioCdnOffloadEnabled;
  if (input.audioMaxFileSizeMb         !== undefined) patch.audio_max_file_size_mb       = input.audioMaxFileSizeMb;

  // Game Previews
  if (input.previewsEnabled           !== undefined) patch.previews_enabled            = input.previewsEnabled;
  if (input.previewsCacheTtlSeconds   !== undefined) patch.previews_cache_ttl_seconds  = input.previewsCacheTtlSeconds;
  if (input.previewsSwrSeconds        !== undefined) patch.previews_swr_seconds        = input.previewsSwrSeconds;
  if (input.previewsCdnOffloadEnabled !== undefined) patch.previews_cdn_offload_enabled = input.previewsCdnOffloadEnabled;
  if (input.previewsEagerLoadEnabled  !== undefined) patch.previews_eager_load_enabled = input.previewsEagerLoadEnabled;
  if (input.previewsAutoplayOnHover   !== undefined) patch.previews_autoplay_on_hover  = input.previewsAutoplayOnHover;

  // Loading Screens
  if (input.loadingScreensEnabled           !== undefined) patch.loading_screens_enabled             = input.loadingScreensEnabled;
  if (input.loadingScreensCacheTtlSeconds   !== undefined) patch.loading_screens_cache_ttl_seconds   = input.loadingScreensCacheTtlSeconds;
  if (input.loadingScreensSwrSeconds        !== undefined) patch.loading_screens_swr_seconds         = input.loadingScreensSwrSeconds;
  if (input.loadingScreensCdnOffloadEnabled !== undefined) patch.loading_screens_cdn_offload_enabled = input.loadingScreensCdnOffloadEnabled;
  if (input.loadingScreensPrefetchEnabled   !== undefined) patch.loading_screens_prefetch_enabled    = input.loadingScreensPrefetchEnabled;

  // Screenshots
  if (input.screenshotsEnabled           !== undefined) patch.screenshots_enabled             = input.screenshotsEnabled;
  if (input.screenshotsCacheTtlSeconds   !== undefined) patch.screenshots_cache_ttl_seconds   = input.screenshotsCacheTtlSeconds;
  if (input.screenshotsSwrSeconds        !== undefined) patch.screenshots_swr_seconds         = input.screenshotsSwrSeconds;
  if (input.screenshotsCdnOffloadEnabled !== undefined) patch.screenshots_cdn_offload_enabled = input.screenshotsCdnOffloadEnabled;
  if (input.screenshotsLazyLoadEnabled   !== undefined) patch.screenshots_lazy_load_enabled   = input.screenshotsLazyLoadEnabled;
  if (input.screenshotsWebpConvertEnabled !== undefined) patch.screenshots_webp_convert_enabled = input.screenshotsWebpConvertEnabled;

  const { data, error } = await supabase
    .from("media_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update Media Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
