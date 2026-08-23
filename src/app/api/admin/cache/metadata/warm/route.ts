import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mapMetadataCacheRow, METADATA_NAMESPACE_CATALOG } from "@/lib/metadata-cache-settings";
import {
  metadataCacheWarmInputSchema,
  firstIssueMessage,
  type MetadataCacheWarmInput,
} from "@/lib/validation-metadata-cache";
import { getOrSetMetadataCache } from "@/lib/metadata-cache";
import {
  resolveCategoryPayload,
  listAllCategorySlugs,
  resolveTagPayload,
  listAllTagSlugs,
  listDeveloperFacets,
  listPublisherFacets,
  resolveGameMetadataPayload,
  listSampleGameSlugs,
  resolveSeoPayload,
} from "@/lib/metadata-cache-resolvers";
import type { SeoEntityType } from "@/lib/metadata-cache-settings";

const DEFAULT_GAME_SAMPLE = 25;
const DEFAULT_SEO_SAMPLE = 10;

/** POST /api/admin/cache/metadata/warm — Admin → Cache → Metadata Cache
 * → per-namespace "Warm Cache". Admin-only. Actually populates the
 * in-process store (metadata-cache.ts) from live Supabase data through
 * the same resolver functions Preview uses — this is the real cache
 * being exercised, not a simulation. Categories and Tags always warm
 * their whole (small) table; Developers/Publishers warm the current
 * facet table (run Recompute first if it's stale); Game Metadata and
 * SEO Metadata warm the `sampleSize` most recently updated published
 * items, since warming every game up front isn't worth doing for a
 * per-slug TTL cache that fills itself in naturally as pages are hit. */
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

  const parsed = metadataCacheWarmInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const { scope, sampleSize } = parsed.data;

  const { data: settingsRow, error: settingsError } = await supabase
    .from("metadata_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (settingsError || !settingsRow) {
    return NextResponse.json({ error: "Failed to load metadata cache settings." }, { status: 500 });
  }
  const settings = mapMetadataCacheRow(settingsRow);

  const enabledMap: Record<MetadataCacheWarmInput["scope"], boolean> = {
    categories: settings.categoriesEnabled,
    tags: settings.tagsEnabled,
    developers: settings.developersEnabled,
    publishers: settings.publishersEnabled,
    games: settings.gameMetadataEnabled,
    seo: settings.seoMetadataEnabled,
  };
  if (!enabledMap[scope]) {
    return NextResponse.json(
      { error: `${METADATA_NAMESPACE_CATALOG[scope]?.label ?? scope} is disabled — enable it above, then warm.` },
      { status: 400 }
    );
  }

  const startedAt = Date.now();

  if (scope === "categories") {
    const slugs = await listAllCategorySlugs();
    let warmed = 0;
    for (const slug of slugs) {
      const { value } = await getOrSetMetadataCache("categories", slug, () => resolveCategoryPayload(slug, settings));
      if (value) warmed++;
    }
    return NextResponse.json({ result: { scope, attempted: slugs.length, warmed, tookMs: Date.now() - startedAt } });
  }

  if (scope === "tags") {
    const slugs = await listAllTagSlugs();
    let warmed = 0;
    for (const slug of slugs) {
      const { value } = await getOrSetMetadataCache("tags", slug, () => resolveTagPayload(slug, settings));
      if (value) warmed++;
    }
    return NextResponse.json({ result: { scope, attempted: slugs.length, warmed, tookMs: Date.now() - startedAt } });
  }

  if (scope === "developers" || scope === "publishers") {
    const isDevelopers = scope === "developers";
    const rows = isDevelopers
      ? await listDeveloperFacets(settings.developersSortBy)
      : await listPublisherFacets(settings.publishersSortBy);
    // One entry — the whole computed leaderboard — rather than one per
    // name, since that's what a "Browse by Developer/Publisher" list
    // consumer would actually read.
    await getOrSetMetadataCache(scope, "list", async () => rows);
    return NextResponse.json({ result: { scope, attempted: rows.length, warmed: rows.length, tookMs: Date.now() - startedAt } });
  }

  if (scope === "games") {
    const limit = sampleSize ?? DEFAULT_GAME_SAMPLE;
    const slugs = await listSampleGameSlugs(limit);
    let warmed = 0;
    for (const slug of slugs) {
      const { value } = await getOrSetMetadataCache("games", slug, () => resolveGameMetadataPayload(slug, settings));
      if (value) warmed++;
    }
    return NextResponse.json({ result: { scope, attempted: slugs.length, warmed, tookMs: Date.now() - startedAt } });
  }

  // scope === "seo"
  const limit = sampleSize ?? DEFAULT_SEO_SAMPLE;
  let attempted = 0;
  let warmed = 0;
  for (const entityType of settings.seoMetadataEntityTypes) {
    let slugs: string[] = [];
    if (entityType === "games") slugs = await listSampleGameSlugs(limit);
    else if (entityType === "categories") slugs = await listAllCategorySlugs();
    else if (entityType === "tags") slugs = await listAllTagSlugs();
    else continue; // "pages" — no resolver yet, see metadata-cache-resolvers.ts

    for (const slug of slugs) {
      attempted++;
      const cacheKey = `${entityType}:${slug}`;
      const { value } = await getOrSetMetadataCache("seo", cacheKey, () =>
        resolveSeoPayload(entityType as SeoEntityType, slug)
      );
      if (value) warmed++;
    }
  }
  return NextResponse.json({ result: { scope, attempted, warmed, tookMs: Date.now() - startedAt } });
}
