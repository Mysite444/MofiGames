import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mapMetadataCacheRow } from "@/lib/metadata-cache-settings";
import { metadataCachePreviewInputSchema, firstIssueMessage } from "@/lib/validation-metadata-cache";
import { getOrSetMetadataCache } from "@/lib/metadata-cache";
import {
  resolveCategoryPayload,
  resolveTagPayload,
  resolveDeveloperPayload,
  resolvePublisherPayload,
  resolveGameMetadataPayload,
  resolveSeoPayload,
} from "@/lib/metadata-cache-resolvers";

/** POST /api/admin/cache/metadata/preview — Admin → Cache → Metadata
 * Cache → "Test a lookup". Admin-only. Runs one real lookup through the
 * exact getOrSetMetadataCache pipeline every real call site uses —
 * category/tag/developer/publisher/game by slug or name, or a resolved
 * SEO payload for `${entityType}:${key}` — and reports whether it was
 * served from cache and how long it took, same shape as search/preview. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = metadataCachePreviewInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const { namespace, key, entityType } = parsed.data;

  if (namespace === "seo" && !entityType) {
    return NextResponse.json({ error: "entityType is required when namespace is \"seo\"." }, { status: 422 });
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from("metadata_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (settingsError || !settingsRow) {
    return NextResponse.json({ error: "Failed to load metadata cache settings." }, { status: 500 });
  }
  const settings = mapMetadataCacheRow(settingsRow);

  const cacheKey = namespace === "seo" ? `${entityType}:${key}` : key;
  const startedAt = Date.now();

  const { value, cacheHit } = await getOrSetMetadataCache(namespace, cacheKey, async () => {
    switch (namespace) {
      case "categories":
        return resolveCategoryPayload(key, settings);
      case "tags":
        return resolveTagPayload(key, settings);
      case "developers":
        return resolveDeveloperPayload(key);
      case "publishers":
        return resolvePublisherPayload(key);
      case "games":
        return resolveGameMetadataPayload(key, settings);
      case "seo":
        return resolveSeoPayload(entityType!, key);
    }
  });

  const tookMs = Date.now() - startedAt;

  if (value === null || value === undefined) {
    return NextResponse.json({
      result: { namespace, key, entityType: entityType ?? null, found: false, cacheHit, tookMs, value: null },
    });
  }

  return NextResponse.json({
    result: { namespace, key, entityType: entityType ?? null, found: true, cacheHit, tookMs, value },
  });
}
