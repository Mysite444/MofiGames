import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { metadataCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation-metadata-cache";

/** GET /api/admin/cache/metadata/settings — Admin → Cache → Metadata
 * Cache. Admin-only, same as every other cache settings row — no secrets
 * live here, but the toggles/TTLs are still an internal operational
 * concern, not public data. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("metadata_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load metadata cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/metadata/settings — Admin → Cache → Metadata
 * Cache. Admin-only. Partial patch — only fields present in the body are
 * written, same shape as every sibling cache settings route. */
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

  const parsed = metadataCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };

  // ── 1. Categories Cache ──────────────────────────────────────────────────
  if (input.categoriesEnabled !== undefined) patch.categories_enabled = input.categoriesEnabled;
  if (input.categoriesTtlSeconds !== undefined) patch.categories_ttl_seconds = input.categoriesTtlSeconds;
  if (input.categoriesIncludeSeoFields !== undefined)
    patch.categories_include_seo_fields = input.categoriesIncludeSeoFields;
  if (input.categoriesIncludeGameCounts !== undefined)
    patch.categories_include_game_counts = input.categoriesIncludeGameCounts;
  if (input.categoriesMaxEntries !== undefined) patch.categories_max_entries = input.categoriesMaxEntries;

  // ── 2. Tags Cache ─────────────────────────────────────────────────────────
  if (input.tagsEnabled !== undefined) patch.tags_enabled = input.tagsEnabled;
  if (input.tagsTtlSeconds !== undefined) patch.tags_ttl_seconds = input.tagsTtlSeconds;
  if (input.tagsIncludeSeoFields !== undefined) patch.tags_include_seo_fields = input.tagsIncludeSeoFields;
  if (input.tagsIncludeUsageCounts !== undefined) patch.tags_include_usage_counts = input.tagsIncludeUsageCounts;
  if (input.tagsMaxEntries !== undefined) patch.tags_max_entries = input.tagsMaxEntries;

  // ── 3. Developers Cache ───────────────────────────────────────────────────
  if (input.developersEnabled !== undefined) patch.developers_enabled = input.developersEnabled;
  if (input.developersTtlSeconds !== undefined) patch.developers_ttl_seconds = input.developersTtlSeconds;
  if (input.developersMinGames !== undefined) patch.developers_min_games = input.developersMinGames;
  if (input.developersMaxResults !== undefined) patch.developers_max_results = input.developersMaxResults;
  if (input.developersSortBy !== undefined) patch.developers_sort_by = input.developersSortBy;

  // ── 4. Publishers Cache ───────────────────────────────────────────────────
  if (input.publishersEnabled !== undefined) patch.publishers_enabled = input.publishersEnabled;
  if (input.publishersTtlSeconds !== undefined) patch.publishers_ttl_seconds = input.publishersTtlSeconds;
  if (input.publishersMinGames !== undefined) patch.publishers_min_games = input.publishersMinGames;
  if (input.publishersMaxResults !== undefined) patch.publishers_max_results = input.publishersMaxResults;
  if (input.publishersSortBy !== undefined) patch.publishers_sort_by = input.publishersSortBy;

  // ── 5. Game Metadata Cache ────────────────────────────────────────────────
  if (input.gameMetadataEnabled !== undefined) patch.game_metadata_enabled = input.gameMetadataEnabled;
  if (input.gameMetadataTtlSeconds !== undefined) patch.game_metadata_ttl_seconds = input.gameMetadataTtlSeconds;
  if (input.gameMetadataMaxEntries !== undefined) patch.game_metadata_max_entries = input.gameMetadataMaxEntries;
  if (input.gameMetadataIncludeRelatedCounts !== undefined)
    patch.game_metadata_include_related_counts = input.gameMetadataIncludeRelatedCounts;
  if (input.gameMetadataBypassForAdmins !== undefined)
    patch.game_metadata_bypass_for_admins = input.gameMetadataBypassForAdmins;

  // ── 6. SEO Metadata Cache ─────────────────────────────────────────────────
  if (input.seoMetadataEnabled !== undefined) patch.seo_metadata_enabled = input.seoMetadataEnabled;
  if (input.seoMetadataTtlSeconds !== undefined) patch.seo_metadata_ttl_seconds = input.seoMetadataTtlSeconds;
  if (input.seoMetadataMaxEntries !== undefined) patch.seo_metadata_max_entries = input.seoMetadataMaxEntries;
  if (input.seoMetadataEntityTypes !== undefined) patch.seo_metadata_entity_types = input.seoMetadataEntityTypes;
  if (input.seoMetadataIncludeJsonLd !== undefined)
    patch.seo_metadata_include_json_ld = input.seoMetadataIncludeJsonLd;

  const { data, error } = await supabase
    .from("metadata_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update metadata cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
