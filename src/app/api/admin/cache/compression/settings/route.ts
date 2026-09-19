import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  compressionCacheSettingsInputSchema,
  type CompressionCacheSettingsInput,
  firstIssueMessage,
} from "@/lib/validation-compression-cache";

/** GET /api/admin/cache/compression/settings
 * Admin-only. Loads the singleton compression_cache_settings row. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("compression_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load Compression settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/compression/settings
 * Admin-only. Validates and merges a partial update into the singleton
 * row. Each of the five feature objects (brotli, gzip, cssMinify,
 * jsMinify, htmlMinify) is optional so the client can patch just one
 * without resending the other four. */
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

  const parsed = compressionCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }

  const input: CompressionCacheSettingsInput = parsed.data;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  if (input.enabled !== undefined) patch.enabled = input.enabled;

  if (input.brotli) {
    const b = input.brotli;
    if (b.enabled !== undefined) patch.brotli_enabled = b.enabled;
    if (b.quality !== undefined) patch.brotli_quality = b.quality;
    if (b.minSizeBytes !== undefined) patch.brotli_min_size_bytes = b.minSizeBytes;
    if (b.mimeTypes !== undefined) patch.brotli_mime_types = b.mimeTypes;
  }

  if (input.gzip) {
    const g = input.gzip;
    if (g.enabled !== undefined) patch.gzip_enabled = g.enabled;
    if (g.level !== undefined) patch.gzip_level = g.level;
    if (g.minSizeBytes !== undefined) patch.gzip_min_size_bytes = g.minSizeBytes;
    if (g.mimeTypes !== undefined) patch.gzip_mime_types = g.mimeTypes;
  }

  if (input.cssMinify) {
    const cm = input.cssMinify;
    if (cm.enabled !== undefined) patch.css_minify_enabled = cm.enabled;
    if (cm.removeComments !== undefined) patch.css_minify_remove_comments = cm.removeComments;
    if (cm.combineFiles !== undefined) patch.css_minify_combine_files = cm.combineFiles;
    if (cm.excludePatterns !== undefined) patch.css_minify_exclude_patterns = cm.excludePatterns;
  }

  if (input.jsMinify) {
    const jm = input.jsMinify;
    if (jm.enabled !== undefined) patch.js_minify_enabled = jm.enabled;
    if (jm.removeComments !== undefined) patch.js_minify_remove_comments = jm.removeComments;
    if (jm.combineFiles !== undefined) patch.js_minify_combine_files = jm.combineFiles;
    if (jm.excludePatterns !== undefined) patch.js_minify_exclude_patterns = jm.excludePatterns;
  }

  if (input.htmlMinify) {
    const hm = input.htmlMinify;
    if (hm.enabled !== undefined) patch.html_minify_enabled = hm.enabled;
    if (hm.removeComments !== undefined) patch.html_minify_remove_comments = hm.removeComments;
    if (hm.collapseWhitespace !== undefined) patch.html_minify_collapse_whitespace = hm.collapseWhitespace;
    if (hm.minifyInlineCssJs !== undefined) patch.html_minify_inline_css_js = hm.minifyInlineCssJs;
  }

  const { data, error } = await supabase
    .from("compression_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to save Compression settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
