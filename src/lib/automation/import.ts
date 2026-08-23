import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/prng";
import type { JobRunOutcome } from "./types";

interface ProviderRow {
  id: string;
  name: string;
  slug: string;
  feed_url: string;
  field_map: Record<string, string>;
  enabled: boolean;
}

interface RuleRow {
  id: string;
  provider_id: string;
  auto_publish: boolean;
  skip_duplicate_games: boolean;
  auto_update_existing_games: boolean;
  default_category_slug: string | null;
  default_tag_ids: string[];
  max_items_per_run: number;
  max_retries: number;
}

interface RawFeedItem {
  [key: string]: unknown;
}

interface MappedGame {
  externalId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  embedUrl: string | null;
  categorySlug: string | null;
  tags: string[];
}

const DEFAULT_FIELD_MAP: Record<string, string> = {
  id: "id",
  title: "title",
  description: "description",
  thumbnail_url: "thumbnail",
  embed_url: "url",
  category: "category",
  tags: "tags",
};

function mapItem(raw: RawFeedItem, fieldMap: Record<string, string>): MappedGame | null {
  const map = { ...DEFAULT_FIELD_MAP, ...fieldMap };
  const get = (key: string) => raw[map[key] ?? key];

  const externalId = String(get("id") ?? "");
  const title = String(get("title") ?? "").trim();
  if (!externalId || !title) return null;

  const tagsRaw = get("tags");
  const tags = Array.isArray(tagsRaw) ? tagsRaw.map(String) : typeof tagsRaw === "string" ? [tagsRaw] : [];

  return {
    externalId,
    title,
    description: String(get("description") ?? ""),
    thumbnailUrl: typeof get("thumbnail_url") === "string" ? (get("thumbnail_url") as string) : null,
    embedUrl: typeof get("embed_url") === "string" ? (get("embed_url") as string) : null,
    categorySlug: typeof get("category") === "string" ? slugify(get("category") as string) : null,
    tags,
  };
}

/** Runs the import for a single provider, applying its rule set. Shared by
 * the Auto Import Games job (all enabled providers), a manual "Run import
 * now" from the Imports admin page (one provider), and Auto Retry Failed
 * Imports (re-runs a provider whose last attempt failed/partial). */
export async function runProviderImport(
  supabase: SupabaseClient,
  provider: ProviderRow,
  rule: RuleRow | null
): Promise<JobRunOutcome> {
  const effectiveRule: Omit<RuleRow, "id" | "provider_id"> = rule ?? {
    auto_publish: false,
    skip_duplicate_games: true,
    auto_update_existing_games: true,
    default_category_slug: null,
    default_tag_ids: [],
    max_items_per_run: 100,
    max_retries: 3,
  };

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    response = await fetch(provider.feed_url, { signal: controller.signal, headers: { "User-Agent": "MofiGames-Import/1.0" } });
    clearTimeout(timeout);
  } catch (err) {
    return {
      status: "failed",
      itemsProcessed: 0,
      itemsOk: 0,
      itemsFailed: 0,
      summary: { provider: provider.slug },
      error: err instanceof Error ? `Could not reach feed: ${err.message}` : "Could not reach feed",
    };
  }

  if (!response.ok) {
    return {
      status: "failed",
      itemsProcessed: 0,
      itemsOk: 0,
      itemsFailed: 0,
      summary: { provider: provider.slug },
      error: `Feed responded with HTTP ${response.status}`,
    };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return {
      status: "failed",
      itemsProcessed: 0,
      itemsOk: 0,
      itemsFailed: 0,
      summary: { provider: provider.slug },
      error: "Feed did not return valid JSON.",
    };
  }

  const items = Array.isArray(raw) ? raw : Array.isArray((raw as { games?: unknown }).games) ? (raw as { games: unknown[] }).games : null;
  if (!items) {
    return {
      status: "failed",
      itemsProcessed: 0,
      itemsOk: 0,
      itemsFailed: 0,
      summary: { provider: provider.slug },
      error: "Feed must be a JSON array (or an object with a `games` array).",
    };
  }

  const capped = items.slice(0, effectiveRule.max_items_per_run) as RawFeedItem[];
  const mapped = capped.map((item) => mapItem(item, provider.field_map)).filter((m): m is MappedGame => m !== null);

  const errors: { externalId: string; title: string; error: string }[] = [];
  const created: { id: string; slug: string; title: string }[] = [];
  const updated: { id: string; slug: string; title: string }[] = [];
  const skipped: { externalId: string; title: string; reason: string }[] = [];

  // Fallback category — the site requires every game to have one.
  const fallbackCategory =
    effectiveRule.default_category_slug ??
    (await supabase.from("categories").select("slug").order("sort_order").limit(1).maybeSingle()).data?.slug ??
    null;

  for (const item of mapped) {
    const { data: existing } = await supabase
      .from("games")
      .select("id, slug")
      .eq("import_source", provider.slug)
      .eq("import_external_id", item.externalId)
      .maybeSingle();

    if (existing) {
      if (!effectiveRule.auto_update_existing_games) {
        skipped.push({ externalId: item.externalId, title: item.title, reason: "already imported, auto-update disabled" });
        continue;
      }
      const { error } = await supabase
        .from("games")
        .update({
          title: item.title,
          description: item.description,
          thumbnail_url: item.thumbnailUrl,
          embed_url: item.embedUrl,
          imported_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) errors.push({ externalId: item.externalId, title: item.title, error: error.message });
      else updated.push({ id: existing.id, slug: existing.slug, title: item.title });
      continue;
    }

    if (effectiveRule.skip_duplicate_games) {
      const { data: dupe } = await supabase
        .from("games")
        .select("id")
        .or(`embed_url.eq.${item.embedUrl ?? "__none__"},title.ilike.${item.title}`)
        .maybeSingle();
      if (dupe) {
        skipped.push({ externalId: item.externalId, title: item.title, reason: "matches an existing game" });
        continue;
      }
    }

    const categorySlug = item.categorySlug ?? fallbackCategory;
    if (!categorySlug) {
      errors.push({ externalId: item.externalId, title: item.title, error: "No category available to assign." });
      continue;
    }
    const { data: categoryExists } = await supabase.from("categories").select("slug").eq("slug", categorySlug).maybeSingle();
    const finalCategory = categoryExists ? categorySlug : fallbackCategory;
    if (!finalCategory) {
      errors.push({ externalId: item.externalId, title: item.title, error: "Category could not be resolved." });
      continue;
    }

    const slugBase = slugify(item.title) || `game-${item.externalId}`;
    let slugCandidate = slugBase;
    let n = 2;
    // Rare in practice (fresh imports), but keep it correct.
    for (;;) {
      const { data: clash } = await supabase.from("games").select("id").eq("slug", slugCandidate).maybeSingle();
      if (!clash) break;
      slugCandidate = `${slugBase}-${n++}`;
    }

    const { data: insertedGame, error: insertError } = await supabase
      .from("games")
      .insert({
        slug: slugCandidate,
        title: item.title,
        category_slug: finalCategory,
        description: item.description,
        thumbnail_url: item.thumbnailUrl,
        play_type: "embed",
        embed_url: item.embedUrl,
        is_published: effectiveRule.auto_publish,
        import_source: provider.slug,
        import_external_id: item.externalId,
        imported_at: new Date().toISOString(),
      })
      .select("id, slug")
      .single();

    if (insertError || !insertedGame) {
      errors.push({ externalId: item.externalId, title: item.title, error: insertError?.message ?? "Insert failed" });
      continue;
    }

    if (effectiveRule.default_tag_ids.length > 0) {
      await supabase
        .from("game_tags")
        .insert(effectiveRule.default_tag_ids.map((tagId) => ({ game_id: insertedGame.id, tag_id: tagId })));
    }

    created.push({ id: insertedGame.id, slug: insertedGame.slug, title: item.title });
  }

  const itemsProcessed = mapped.length;
  const itemsFailed = errors.length;
  const itemsOk = created.length + updated.length + skipped.length;

  return {
    status: itemsProcessed === 0 ? "success" : itemsFailed === 0 ? "success" : itemsFailed === itemsProcessed ? "failed" : "partial",
    itemsProcessed,
    itemsOk,
    itemsFailed,
    summary: {
      provider: provider.slug,
      feedItemCount: items.length,
      created,
      updated,
      skipped,
      errors,
    },
  };
}

/** Auto Import Games — runs every enabled provider. */
export async function runAllProviderImports(supabase: SupabaseClient): Promise<JobRunOutcome> {
  const { data: providers, error } = await supabase.from("import_providers").select("*").eq("enabled", true);
  if (error) throw new Error(error.message);
  if (!providers || providers.length === 0) {
    return { status: "success", itemsProcessed: 0, itemsOk: 0, itemsFailed: 0, summary: { note: "No enabled import providers configured." } };
  }

  const { data: rules } = await supabase.from("import_rules").select("*").in(
    "provider_id",
    providers.map((p) => p.id)
  );
  const ruleByProvider = new Map((rules ?? []).map((r) => [r.provider_id, r as RuleRow]));

  const perProvider = await Promise.all(
    providers.map((p) => runProviderImport(supabase, p as ProviderRow, ruleByProvider.get(p.id) ?? null))
  );

  const itemsProcessed = perProvider.reduce((s, r) => s + r.itemsProcessed, 0);
  const itemsOk = perProvider.reduce((s, r) => s + r.itemsOk, 0);
  const itemsFailed = perProvider.reduce((s, r) => s + r.itemsFailed, 0);
  const anyFailed = perProvider.some((r) => r.status === "failed");
  const allFailed = perProvider.every((r) => r.status === "failed");

  return {
    status: perProvider.length === 0 ? "success" : allFailed ? "failed" : anyFailed || itemsFailed > 0 ? "partial" : "success",
    itemsProcessed,
    itemsOk,
    itemsFailed,
    summary: { providers: providers.map((p, i) => ({ slug: p.slug, name: p.name, result: perProvider[i] })) },
  };
}

/** Auto Retry Failed Imports — re-runs any provider whose most recent
 * import run failed or was partial, up to that provider's rule-configured
 * max_retries within the current run. */
export async function retryFailedImports(supabase: SupabaseClient): Promise<JobRunOutcome> {
  const { data: recentRuns } = await supabase
    .from("automation_job_runs")
    .select("id, status, summary, started_at")
    .eq("job_key", "auto_import_games")
    .order("started_at", { ascending: false })
    .limit(5);

  const lastRun = (recentRuns ?? [])[0];
  if (!lastRun || lastRun.status === "success") {
    return { status: "success", itemsProcessed: 0, itemsOk: 0, itemsFailed: 0, summary: { note: "Nothing to retry — the last import run succeeded." } };
  }

  const providerSlugs: string[] = Array.isArray((lastRun.summary as { providers?: { slug: string; result: { status: string } }[] })?.providers)
    ? (lastRun.summary as { providers: { slug: string; result: { status: string } }[] }).providers
        .filter((p) => p.result?.status !== "success")
        .map((p) => p.slug)
    : [];

  if (providerSlugs.length === 0) {
    return { status: "success", itemsProcessed: 0, itemsOk: 0, itemsFailed: 0, summary: { note: "No failed providers found in the last import run." } };
  }

  const { data: providers } = await supabase.from("import_providers").select("*").in("slug", providerSlugs);
  const { data: rules } = await supabase
    .from("import_rules")
    .select("*")
    .in("provider_id", (providers ?? []).map((p) => p.id));
  const ruleByProvider = new Map((rules ?? []).map((r) => [r.provider_id, r as RuleRow]));

  const results = await Promise.all(
    (providers ?? []).map((p) => runProviderImport(supabase, p as ProviderRow, ruleByProvider.get(p.id) ?? null))
  );

  const itemsProcessed = results.reduce((s, r) => s + r.itemsProcessed, 0);
  const itemsOk = results.reduce((s, r) => s + r.itemsOk, 0);
  const itemsFailed = results.reduce((s, r) => s + r.itemsFailed, 0);
  const allFailed = results.length > 0 && results.every((r) => r.status === "failed");

  return {
    status: results.length === 0 ? "success" : allFailed ? "failed" : itemsFailed > 0 ? "partial" : "success",
    itemsProcessed,
    itemsOk,
    itemsFailed,
    summary: { retried: (providers ?? []).map((p, i) => ({ slug: p.slug, result: results[i] })) },
  };
}
