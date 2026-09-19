import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { imageCacheSettingsInputSchema } from "@/lib/validation-image-cache";

/** GET /api/admin/cache/image/settings
 * Admin-only. Loads the singleton image_cache_settings row. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("image_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load Image Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/image/settings
 * Admin-only. Validates and merges a partial update into the singleton row. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = imageCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }

  const input = parsed.data;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  // Master
  if (input.enabled !== undefined)                   patch.enabled = input.enabled;

  // WebP
  if (input.webpEnabled !== undefined)               patch.webp_enabled = input.webpEnabled;
  if (input.webpQuality !== undefined)               patch.webp_quality = input.webpQuality;
  if (input.webpKeepOriginal !== undefined)          patch.webp_keep_original = input.webpKeepOriginal;
  if (input.webpSizeThreshold !== undefined)         patch.webp_size_threshold = input.webpSizeThreshold;

  // AVIF
  if (input.avifEnabled !== undefined)               patch.avif_enabled = input.avifEnabled;
  if (input.avifQuality !== undefined)               patch.avif_quality = input.avifQuality;
  if (input.avifKeepOriginal !== undefined)          patch.avif_keep_original = input.avifKeepOriginal;
  if (input.avifEffort !== undefined)                patch.avif_effort = input.avifEffort;

  // Responsive
  if (input.responsiveEnabled !== undefined)         patch.responsive_enabled = input.responsiveEnabled;
  if (input.srcsetBreakpoints !== undefined)         patch.srcset_breakpoints = input.srcsetBreakpoints;
  if (input.pictureElementEnabled !== undefined)     patch.picture_element_enabled = input.pictureElementEnabled;
  if (input.sizesAttribute !== undefined)            patch.sizes_attribute = input.sizesAttribute;

  // Thumbnail Cache
  if (input.thumbnailCacheEnabled !== undefined)     patch.thumbnail_cache_enabled = input.thumbnailCacheEnabled;
  if (input.thumbnailCacheTtl !== undefined)         patch.thumbnail_cache_ttl = input.thumbnailCacheTtl;
  if (input.thumbnailStorageDriver !== undefined)    patch.thumbnail_storage_driver = input.thumbnailStorageDriver;
  if (input.thumbnailMaxVariants !== undefined)      patch.thumbnail_max_variants = input.thumbnailMaxVariants;

  // Lazy Loading
  if (input.lazyLoadEnabled !== undefined)           patch.lazy_load_enabled = input.lazyLoadEnabled;
  if (input.lazyLoadStrategy !== undefined)          patch.lazy_load_strategy = input.lazyLoadStrategy;
  if (input.lazyLoadRootMargin !== undefined)        patch.lazy_load_root_margin = input.lazyLoadRootMargin;
  if (input.lazyLoadThreshold !== undefined)         patch.lazy_load_threshold = input.lazyLoadThreshold;
  if (input.lqipEnabled !== undefined)               patch.lqip_enabled = input.lqipEnabled;
  if (input.placeholderColor !== undefined)          patch.placeholder_color = input.placeholderColor;

  // Image Optimisation Cache
  if (input.optimisationCacheEnabled !== undefined)  patch.optimisation_cache_enabled = input.optimisationCacheEnabled;
  if (input.optimisationCacheTtl !== undefined)      patch.optimisation_cache_ttl = input.optimisationCacheTtl;
  if (input.optimisationCacheSwr !== undefined)      patch.optimisation_cache_swr = input.optimisationCacheSwr;
  if (input.varyByAccept !== undefined)              patch.vary_by_accept = input.varyByAccept;

  // Image Resizing Cache
  if (input.resizingCacheEnabled !== undefined)      patch.resizing_cache_enabled = input.resizingCacheEnabled;
  if (input.resizingCacheTtl !== undefined)          patch.resizing_cache_ttl = input.resizingCacheTtl;
  if (input.resizingCacheMaxEntries !== undefined)   patch.resizing_cache_max_entries = input.resizingCacheMaxEntries;
  if (input.defaultFit !== undefined)                patch.default_fit = input.defaultFit;
  if (input.defaultQuality !== undefined)            patch.default_quality = input.defaultQuality;
  if (input.maxResizeWidth !== undefined)            patch.max_resize_width = input.maxResizeWidth;
  if (input.maxResizeHeight !== undefined)           patch.max_resize_height = input.maxResizeHeight;

  const { data, error } = await supabase
    .from("image_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to save Image Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
