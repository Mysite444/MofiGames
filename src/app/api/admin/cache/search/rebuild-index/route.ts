import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mapSearchCacheRow, redactSecret } from "@/lib/search-cache-settings";

const FETCH_TIMEOUT_MS = 8000;

/** For 'external' (Meilisearch/Algolia): a lightweight reachability check
 * against the configured host, not a real index push (this app has no
 * indexing pipeline to a hosted engine yet — Search Indexes here
 * configures *which* backend would answer a query, the actual document
 * sync is out of scope until that integration exists). Meilisearch
 * exposes GET /health; Algolia has no host of its own to ping the same
 * way, so for that engine this just confirms the host string resolves
 * and responds to *something* rather than claiming a real API check. */
async function checkExternalHost(host: string, apiKey: string | null): Promise<{ ok: boolean; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = host.replace(/\/+$/, "") + "/health";
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
      signal: controller.signal,
    });
    if (res.ok) return { ok: true, message: `Reached ${host} — responded ${res.status}.` };
    return { ok: false, message: `${host} responded with HTTP ${res.status}.` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown error";
    return { ok: false, message: `Could not reach ${host} — ${reason}.` };
  } finally {
    clearTimeout(timeout);
  }
}

/** POST /api/admin/cache/search/rebuild-index — Admin → Cache → Search
 * Cache → Search Indexes → "Rebuild Index Now". Admin-only.
 *
 * For 'postgres_ilike' / 'postgres_fts' (this app's own data, always
 * reachable): runs a real count against each enabled source table
 * (games, categories, tags, posts) rather than fabricating a number —
 * for Postgres backends the "index" is the table itself (plus, for
 * postgres_fts, a generated tsvector column once that migration lands),
 * so "rebuild" is really "recount what's there and record it as fresh".
 *
 * For 'external': no document-sync pipeline exists yet (see
 * checkExternalHost above) — this checks reachability and is honest
 * about not doing more than that. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: settingsRow, error: settingsError } = await supabase
    .from("search_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (settingsError || !settingsRow) {
    return NextResponse.json({ error: "Failed to load search cache settings." }, { status: 500 });
  }
  const settings = mapSearchCacheRow(settingsRow);
  const startedAt = Date.now();

  let status: "success" | "failed";
  let message: string;
  let docCount: number | null = null;

  if (settings.indexBackend === "external") {
    const rawRow = settingsRow as Record<string, unknown> & { external_api_key?: string | null };
    if (!settings.externalHost) {
      status = "failed";
      message = `No host configured for ${settings.externalEngine} — add one above, then rebuild.`;
    } else {
      const check = await checkExternalHost(settings.externalHost, (rawRow.external_api_key as string) ?? null);
      status = check.ok ? "success" : "failed";
      message = check.ok
        ? `${check.message} Document sync to ${settings.externalEngine} isn't wired up yet in this app — this confirms the engine is reachable.`
        : check.message;
    }
  } else {
    const enabledSources = new Set(settings.indexSources.filter((s) => s.enabled).map((s) => s.key));
    const counts: Record<string, number> = {};
    const errors: string[] = [];

    async function recordCount(key: string, result: { count: number | null; error: { message: string } | null }) {
      if (result.error) errors.push(`${key}: ${result.error.message}`);
      else counts[key] = result.count ?? 0;
    }

    if (enabledSources.has("games")) {
      await recordCount("games", await supabase.from("games").select("*", { count: "exact", head: true }).eq("is_published", true));
    }
    if (enabledSources.has("categories")) {
      await recordCount("categories", await supabase.from("categories").select("*", { count: "exact", head: true }));
    }
    if (enabledSources.has("tags")) {
      await recordCount("tags", await supabase.from("tags").select("*", { count: "exact", head: true }));
    }
    if (enabledSources.has("blog_posts")) {
      await recordCount("blog_posts", await supabase.from("posts").select("*", { count: "exact", head: true }).eq("is_published", true));
    }

    docCount = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const summary = Object.entries(counts)
      .map(([key, n]) => `${n} ${key.replace("_", " ")}`)
      .join(", ");

    if (errors.length > 0) {
      status = "failed";
      message = `Counted ${summary || "nothing"} before hitting an error — ${errors.join("; ")}`;
    } else if (docCount === 0) {
      status = "failed";
      message = "No index sources are enabled — turn at least one on above, then rebuild.";
    } else {
      status = "success";
      message = `Indexed ${summary} via ${settings.indexBackend === "postgres_fts" ? "Postgres full-text search" : "ILIKE"}.`;
    }
  }

  const durationMs = Date.now() - startedAt;
  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("search_cache_settings")
    .update({
      index_last_built_at: now,
      index_last_build_duration_ms: durationMs,
      index_last_build_doc_count: docCount,
      index_last_build_status: status,
      index_last_build_message: message,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json(
      { result: { status, message, durationMs, docCount }, settings: null, warning: "Rebuild ran but failed to record the result." },
      { status: 207 }
    );
  }

  const { external_api_key, ...rest } = updated as Record<string, unknown> & { external_api_key?: string | null };
  const redacted = redactSecret(external_api_key ?? null);

  return NextResponse.json({
    result: { status, message, durationMs, docCount },
    settings: { ...rest, external_api_key_set: redacted.set, external_api_key_preview: redacted.preview },
  });
}
