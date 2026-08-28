import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  staticAssetCacheSettingsInputSchema,
  type StaticAssetCacheSettingsInput,
} from "@/lib/validation-static-asset-cache";

/** GET /api/admin/cache/static-assets/settings
 * Admin-only. Loads the singleton static_asset_cache_settings row. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("static_asset_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load Static Asset Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

/** Flattens one { enabled, maxAge, cdnMaxAge, staleWhileRevalidate, immutable,
 * compressionEnabled, ...extra } object into `${prefix}_snake_case` patch
 * keys, so every asset type reuses the same conversion instead of six
 * near-identical blocks of if-statements. Generic because each asset type's
 * zod-inferred shape is a distinct object type with no index signature. */
function flattenAssetPatch<T extends object>(
  prefix: string,
  input: T | undefined,
  patch: Record<string, unknown>,
  extraKeyMap: Record<string, string> = {},
) {
  if (!input) return;
  const record = input as Record<string, unknown>;

  const commonKeyMap: Record<string, string> = {
    enabled: "enabled",
    maxAge: "max_age",
    cdnMaxAge: "cdn_max_age",
    staleWhileRevalidate: "stale_while_revalidate",
    immutable: "immutable",
    compressionEnabled: "compression_enabled",
  };
  const keyMap = { ...commonKeyMap, ...extraKeyMap };

  for (const [camelKey, snakeSuffix] of Object.entries(keyMap)) {
    if (record[camelKey] !== undefined) {
      patch[`${prefix}_${snakeSuffix}`] = record[camelKey];
    }
  }
}

/** PUT /api/admin/cache/static-assets/settings
 * Admin-only. Validates and merges a partial update into the singleton row.
 * Each of the seven asset-type objects is optional so the client can patch
 * a single type (e.g. just `fonts`) without resending the other six. */
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

  const parsed = staticAssetCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }

  const input: StaticAssetCacheSettingsInput = parsed.data;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  if (input.enabled !== undefined) patch.enabled = input.enabled;

  flattenAssetPatch("css", input.css, patch);
  flattenAssetPatch("javascript", input.javascript, patch);
  flattenAssetPatch("fonts", input.fonts, patch, {
    preloadEnabled: "preload_enabled",
    fontDisplay: "font_display",
    crossOriginEnabled: "cross_origin_enabled",
  });
  flattenAssetPatch("svg", input.svg, patch, {
    spriteEnabled: "sprite_enabled",
    inlineThresholdBytes: "inline_threshold_bytes",
  });
  flattenAssetPatch("icons", input.icons, patch, {
    fingerprintEnabled: "fingerprint_enabled",
  });
  flattenAssetPatch("videos", input.videos, patch, {
    rangeRequestsEnabled: "range_requests_enabled",
    preload: "preload",
  });
  flattenAssetPatch("audio", input.audio, patch, {
    rangeRequestsEnabled: "range_requests_enabled",
    preload: "preload",
  });

  const { data, error } = await supabase
    .from("static_asset_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to save Static Asset Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
